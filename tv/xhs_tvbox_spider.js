const host = 'https://www.xiaohongshu.com';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://www.xiaohongshu.com/'
};

// ========== 工具函数 ==========

function extractState(html) {
    if (!html || html.indexOf('window.__INITIAL_STATE__') === -1) return null;
    let match = html.match(/<script[^>]*>window\.__INITIAL_STATE__\s*=\s*({.+?})<\/script>/s);
    if (!match) match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
    if (!match) return null;
    let jsonStr = match[1];
    jsonStr = jsonStr.replace(/(?<=[:\[,\s])(undefined)(?=[\s:,\}\]])/g, 'null');
    jsonStr = jsonStr.replace(/NaN/g, 'null');
    try { return JSON.parse(jsonStr); } catch(e) { return null; }
}

// 从笔记页面提取720P视频流
async function getNoteVideo720P(noteId, xsecToken) {
    let noteUrl = host + '/explore/' + noteId;
    if (xsecToken) {
        noteUrl += '?xsec_token=' + encodeURIComponent(xsecToken) + '&xsec_source=pc_stab';
    }

    try {
        const r = await req(noteUrl, { headers });
        if (!r || !r.content) return null;

        const state = extractState(r.content);
        if (!state) return null;

        const noteData = state.note?.noteDetailMap?.[noteId]?.note || {};
        const videoData = noteData.video || {};

        let allStreams = [];

        // 1. 从 media.stream 提取
        const media = videoData.media || {};
        const stream = media.stream || {};
        const codecs = ['h264', 'h265', 'av1'];

        for (const codec of codecs) {
            if (stream[codec] && Array.isArray(stream[codec])) {
                for (const s of stream[codec]) {
                    allStreams.push({
                        url: s.masterUrl || (s.backupUrls && s.backupUrls[0]) || '',
                        width: s.width || 0,
                        height: s.height || 0
                    });
                }
            }
        }

        // 2. 从 mediaV2 提取
        const mediaV2Str = videoData.mediaV2 || '';
        if (typeof mediaV2Str === 'string' && mediaV2Str.length > 0) {
            try {
                const mediaV2 = JSON.parse(mediaV2Str);
                if (mediaV2 && mediaV2.video && mediaV2.video.stream) {
                    const streamV2 = mediaV2.video.stream;
                    for (const codec of codecs) {
                        if (streamV2[codec] && Array.isArray(streamV2[codec])) {
                            for (const s of streamV2[codec]) {
                                allStreams.push({
                                    url: s.master_url || (s.backup_urls && s.backup_urls[0]) || '',
                                    width: s.width || 0,
                                    height: s.height || 0
                                });
                            }
                        }
                    }
                }
            } catch(e) {}
        }

        // 过滤有效URL
        allStreams = allStreams.filter(s => s.url && s.url.indexOf('http') === 0);

        // 去重
        const seen = new Set();
        allStreams = allStreams.filter(s => {
            const base = s.url.split('?')[0];
            if (seen.has(base)) return false;
            seen.add(base);
            return true;
        });

        // 优先720P
        let target720 = allStreams.find(s => s.width === 1280 && s.height === 720);
        if (target720) return target720.url;

        let near720 = allStreams.filter(s => s.height >= 600 && s.height <= 900);
        if (near720.length > 0) {
            near720.sort((a, b) => b.height - a.height);
            return near720[0].url;
        }

        if (allStreams.length > 0) {
            allStreams.sort((a, b) => (a.width * a.height) - (b.width * b.height));
            return allStreams[0].url;
        }

        return null;
    } catch(e) {
        return null;
    }
}

// 智能分类
function getCategory(title) {
    if (!title) return 'other';
    if (title.indexOf('回放') !== -1 || title.indexOf('全场') !== -1) return 'replay';
    if (title.indexOf('集锦') !== -1 || title.indexOf('高光') !== -1) return 'highlight';
    return 'other';
}

// ========== TVBOX 接口 ==========

async function init(cfg) {}

async function home(filter) {
    // 一级菜单：四个固定分类
    return JSON.stringify({
        class: [
            { type_id: 'replay', type_name: '全场回放' },
            { type_id: 'highlight', type_name: '全场集锦' },
            { type_id: 'report', type_name: '战报' },
            { type_id: 'high', type_name: '高光时刻' }
        ]
    });
}

async function homeVod() {
    // 首页直接显示所有比赛列表
    // 从 /worldcup26 提取所有比赛数据
    try {
        const r = await req(host + '/worldcup26', { headers });
        if (!r || !r.content) {
            return JSON.stringify({ list: [] });
        }

        const state = extractState(r.content);
        if (!state || !state.worldCupMatch || !state.worldCupMatch.matches) {
            return JSON.stringify({ list: [] });
        }

        const matches = state.worldCupMatch.matches;
        const list = [];

        for (const match of matches) {
            // 构建背景图URL（使用球队logo组合或默认背景）
            const homeLogo = match.homeTeamLogo || '';
            const awayLogo = match.awayTeamLogo || '';

            list.push({
                vod_id: match.matchId || '',
                vod_name: (match.homeTeamName || '') + ' vs ' + (match.awayTeamName || ''),
                vod_pic: homeLogo,  // 使用主队logo作为封面
                vod_remarks: (match.statusDesc || '') + ' | ' + (match.homeScore || '0') + '-' + (match.awayScore || '0'),
                vod_content: (match.roundStage || '') + ' ' + (match.matchTime || '') + '\n' +
                            (match.venue || '')
            });
        }

        return JSON.stringify({ list: list });

    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

async function category(tid, pg, filter, extend) {
    // tid 是分类ID: replay, highlight, report, high
    // 但这里我们返回的是比赛列表，分类在详情中处理
    // 或者根据分类筛选比赛？

    // 实际上，category 应该返回该分类下的视频列表
    // 但视频是在比赛详情中的，所以需要先选择比赛

    // 这里返回空列表，让用户先选择比赛
    return JSON.stringify({ list: [] });
}

async function detail(id) {
    // id 是 matchId，如 4459814
    // 需要获取该比赛的所有分类视频

    const matchUrl = host + '/worldcup26/match/' + id + '?wcup_source=web_main_venue_page';

    try {
        const r = await req(matchUrl, { headers });
        if (!r || !r.content) {
            return JSON.stringify({
                list: [{
                    vod_id: id,
                    vod_name: '请求失败',
                    vod_pic: '',
                    vod_remarks: '',
                    vod_content: '无法获取比赛数据',
                    vod_play_from: '测试',
                    vod_play_url: '测试$https://www.baidu.com'
                }]
            });
        }

        const state = extractState(r.content);
        if (!state) {
            return JSON.stringify({
                list: [{
                    vod_id: id,
                    vod_name: '解析失败',
                    vod_pic: '',
                    vod_remarks: '',
                    vod_content: '无法解析数据',
                    vod_play_from: '测试',
                    vod_play_url: '测试$https://www.baidu.com'
                }]
            });
        }

        const matchBase = state.worldCupMatch?.matchBase || {};
        const matchInfo = state.worldCupMatch?.matchInfo || {};

        const homeTeam = matchBase.homeTeamName || '未知';
        const awayTeam = matchBase.awayTeamName || '未知';

        // 收集四个分类的视频
        const categoryVideos = {
            replay: [],
            highlight: [],
            report: [],
            high: []
        };

        // 1. 全场回放 - liveInfo.replayNoteId
        const liveInfo = matchBase.liveInfo || {};
        if (liveInfo.replayNoteId) {
            const videoUrl = await getNoteVideo720P(liveInfo.replayNoteId, liveInfo.xsecToken || '');
            if (videoUrl) {
                categoryVideos.replay.push('官方全场回放$' + videoUrl);
            }
        }

        // 2. 战报 - reportList
        const reportList = matchInfo.reportList || [];
        for (let i = 0; i < reportList.length; i++) {
            const item = reportList[i];
            if (item.type === 'video' && item.noteId) {
                const cat = getCategory(item.title || '');
                const videoUrl = await getNoteVideo720P(item.noteId, item.xsecToken || '');
                if (videoUrl) {
                    if (cat === 'replay') {
                        categoryVideos.replay.push((item.title || '回放' + (i + 1)) + '$' + videoUrl);
                    } else if (cat === 'highlight') {
                        categoryVideos.highlight.push((item.title || '集锦' + (i + 1)) + '$' + videoUrl);
                    } else {
                        categoryVideos.report.push((item.title || '战报' + (i + 1)) + '$' + videoUrl);
                    }
                }
            }
        }

        // 3. 高光 - highList
        const highList = matchInfo.highList || [];
        for (let i = 0; i < highList.length; i++) {
            const item = highList[i];
            if (item.type === 'video' && item.noteId) {
                const cat = getCategory(item.title || '');
                const videoUrl = await getNoteVideo720P(item.noteId, item.xsecToken || '');
                if (videoUrl) {
                    if (cat === 'replay') {
                        categoryVideos.replay.push((item.title || '回放' + (i + 1)) + '$' + videoUrl);
                    } else if (cat === 'highlight') {
                        categoryVideos.highlight.push((item.title || '集锦' + (i + 1)) + '$' + videoUrl);
                    } else {
                        categoryVideos.high.push((item.title || '高光' + (i + 1)) + '$' + videoUrl);
                    }
                }
            }
        }

        // 构建播放源
        const playFrom = [];
        const playUrl = [];

        if (categoryVideos.replay.length > 0) {
            playFrom.push('全场回放');
            playUrl.push(categoryVideos.replay.join('#'));
        }
        if (categoryVideos.highlight.length > 0) {
            playFrom.push('全场集锦');
            playUrl.push(categoryVideos.highlight.join('#'));
        }
        if (categoryVideos.report.length > 0) {
            playFrom.push('战报');
            playUrl.push(categoryVideos.report.join('#'));
        }
        if (categoryVideos.high.length > 0) {
            playFrom.push('高光时刻');
            playUrl.push(categoryVideos.high.join('#'));
        }

        if (playFrom.length === 0) {
            playFrom.push('暂无视频');
            playUrl.push('暂无$https://www.baidu.com');
        }

        return JSON.stringify({
            list: [{
                vod_id: id,
                vod_name: homeTeam + ' vs ' + awayTeam,
                vod_pic: matchBase.homeTeamLogo || '',
                vod_remarks: matchBase.statusDesc || '',
                vod_content: homeTeam + ' ' + (matchBase.homeScore || '0') + ' - ' + (matchBase.awayScore || '0') + ' ' + awayTeam + '\n' +
                            '比赛时间: ' + (matchBase.matchTime || '') + '\n' +
                            '场地: ' + (matchBase.venue || '') + '\n' +
                            '阶段: ' + (matchBase.roundStage || ''),
                vod_play_from: playFrom.join('$$$'),
                vod_play_url: playUrl.join('$$$')
            }]
        });

    } catch (e) {
        return JSON.stringify({
            list: [{
                vod_id: id,
                vod_name: '异常: ' + e.message,
                vod_pic: '',
                vod_remarks: '',
                vod_content: e.toString(),
                vod_play_from: '测试',
                vod_play_url: '测试$https://www.baidu.com'
            }]
        });
    }
}

async function search(wd, quick, pg) {
    return JSON.stringify({ page: pg, list: [] });
}

async function play(flag, id, flags) {
    return JSON.stringify({
        parse: 0,
        url: id,
        header: {
            'User-Agent': headers['User-Agent'],
            'Referer': 'https://www.xiaohongshu.com/',
            'Origin': 'https://www.xiaohongshu.com'
        }
    });
}

export default { init, home, homeVod, category, detail, search, play };

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

        // 优先选择720P (1280x720)
        let target720 = allStreams.find(s => s.width === 1280 && s.height === 720);
        if (target720) return target720.url;

        // 找接近720P的 (高度 600-900)
        let near720 = allStreams.filter(s => s.height >= 600 && s.height <= 900);
        if (near720.length > 0) {
            near720.sort((a, b) => b.height - a.height);
            return near720[0].url;
        }

        // 返回最低清晰度
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
function getVideoCategory(title) {
    if (!title) return '其他';
    if (title.indexOf('回放') !== -1 || title.indexOf('全场') !== -1) return '全场回放';
    if (title.indexOf('集锦') !== -1) return '全场集锦';
    return '其他';
}

// ========== TVBOX 接口 ==========

async function init(cfg) {}

async function home(filter) {
    // 尝试获取真实比赛列表
    try {
        const r = await req(host + '/worldcup26', { headers });
        if (r && r.content) {
            const state = extractState(r.content);
            if (state && state.worldCupMatch && state.worldCupMatch.matches) {
                const matches = state.worldCupMatch.matches;
                // 按状态分组：进行中、未开始、已结束
                const liveMatches = matches.filter(m => m.status === '1' || m.status === '2');
                const upcomingMatches = matches.filter(m => m.status === '0');
                const finishedMatches = matches.filter(m => m.status === '3' || m.status === '-1');

                let classes = [];
                if (liveMatches.length > 0) {
                    classes.push({ type_id: 'live', type_name: '进行中(' + liveMatches.length + ')' });
                }
                if (upcomingMatches.length > 0) {
                    classes.push({ type_id: 'upcoming', type_name: '未开始(' + upcomingMatches.length + ')' });
                }
                if (finishedMatches.length > 0) {
                    classes.push({ type_id: 'finished', type_name: '已结束(' + finishedMatches.length + ')' });
                }
                classes.push({ type_id: 'all', type_name: '全部(' + matches.length + ')' });

                return JSON.stringify({ class: classes });
            }
        }
    } catch(e) {}

    // 默认返回
    return JSON.stringify({
        class: [
            { type_id: 'live', type_name: '进行中' },
            { type_id: 'upcoming', type_name: '未开始' },
            { type_id: 'finished', type_name: '已结束' },
            { type_id: 'all', type_name: '全部比赛' }
        ]
    });
}

async function homeVod() {
    // 返回空列表，让用户先选择分类
    return JSON.stringify({ list: [] });
}

async function category(tid, pg, filter, extend) {
    // tid: live/upcoming/finished/all
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
        let filteredMatches = [];

        if (tid === 'live') {
            filteredMatches = matches.filter(m => m.status === '1' || m.status === '2');
        } else if (tid === 'upcoming') {
            filteredMatches = matches.filter(m => m.status === '0');
        } else if (tid === 'finished') {
            filteredMatches = matches.filter(m => m.status === '3' || m.status === '-1');
        } else {
            filteredMatches = matches;
        }

        const videos = filteredMatches.map(match => {
            const statusText = match.statusDesc || '';
            const scoreText = (match.homeScore || '0') + '-' + (match.awayScore || '0');
            const roundText = match.roundStage || '';

            return {
                vod_id: match.matchId || '',
                vod_name: (match.homeTeamName || 'TBD') + ' vs ' + (match.awayTeamName || 'TBD'),
                vod_pic: match.homeTeamLogo || match.awayTeamLogo || '',
                vod_remarks: statusText + ' | ' + scoreText,
                vod_content: roundText + ' ' + (match.matchTime || '') + ' ' + (match.venue || '')
            };
        });

        return JSON.stringify({ list: videos });

    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

async function detail(id) {
    // id 是 matchId
    const matchUrl = host + '/worldcup26/match/' + id + '?wcup_source=web_main_venue_page';

    try {
        const r = await req(matchUrl, { headers });
        if (!r || !r.content) {
            return JSON.stringify({
                list: [{
                    vod_id: id,
                    vod_name: '请求失败',
                    vod_pic: '',
                    vod_remarks: '错误',
                    vod_content: '无法获取比赛页面',
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
                    vod_remarks: '错误',
                    vod_content: '无法解析页面数据',
                    vod_play_from: '测试',
                    vod_play_url: '测试$https://www.baidu.com'
                }]
            });
        }

        const matchBase = state.worldCupMatch?.matchBase || {};
        const matchInfo = state.worldCupMatch?.matchInfo || {};

        const homeTeam = matchBase.homeTeamName || '未知';
        const awayTeam = matchBase.awayTeamName || '未知';
        const homeScore = matchBase.homeScore || '0';
        const awayScore = matchBase.awayScore || '0';

        // 收集四个分类的视频
        const categoryVideos = {
            '全场回放': [],
            '全场集锦': [],
            '战报': [],
            '高光时刻': []
        };

        // 1. 全场回放 - liveInfo.replayNoteId
        const liveInfo = matchBase.liveInfo || {};
        if (liveInfo.replayNoteId) {
            const videoUrl = await getNoteVideo720P(liveInfo.replayNoteId, liveInfo.xsecToken || '');
            if (videoUrl) {
                categoryVideos['全场回放'].push('官方全场回放$' + videoUrl);
            }
        }

        // 2. 战报 - reportList
        const reportList = matchInfo.reportList || [];
        for (let i = 0; i < reportList.length; i++) {
            const item = reportList[i];
            if (item.noteId && item.type === 'video') {
                const videoUrl = await getNoteVideo720P(item.noteId, item.xsecToken || '');
                const title = item.title || '战报' + (i + 1);
                if (videoUrl) {
                    const cat = getVideoCategory(title);
                    if (cat === '全场集锦') {
                        categoryVideos['全场集锦'].push(title + '$' + videoUrl);
                    } else {
                        categoryVideos['战报'].push(title + '$' + videoUrl);
                    }
                }
            }
        }

        // 3. 高光时刻 - highList
        const highList = matchInfo.highList || [];
        for (let i = 0; i < highList.length; i++) {
            const item = highList[i];
            if (item.noteId && item.type === 'video') {
                const videoUrl = await getNoteVideo720P(item.noteId, item.xsecToken || '');
                const title = item.title || '高光' + (i + 1);
                if (videoUrl) {
                    const cat = getVideoCategory(title);
                    if (cat === '全场集锦') {
                        categoryVideos['全场集锦'].push(title + '$' + videoUrl);
                    } else {
                        categoryVideos['高光时刻'].push(title + '$' + videoUrl);
                    }
                }
            }
        }

        // 构建播放源
        const playFrom = [];
        const playUrl = [];

        for (const [catName, videos] of Object.entries(categoryVideos)) {
            if (videos.length > 0) {
                playFrom.push(catName);
                playUrl.push(videos.join('#'));
            }
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
                vod_content: homeTeam + ' ' + homeScore + ' - ' + awayScore + ' ' + awayTeam + '\n' +
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
                vod_remarks: '错误',
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

const host = 'https://www.xiaohongshu.com';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://www.xiaohongshu.com/'
};

// 占位图片
const placeholderImg = 'https://via.placeholder.com/300x400?text=No+Image';

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

// 判断是否为720P或更低分辨率（节省带宽，加载更快）
function is720POrLower(width, height) {
    if (!width || !height) return true; // 没有分辨率信息的默认包含
    return width <= 1280 || height <= 720;
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

        let bestUrl = null;
        let bestSize = 999999999; // 优先选择较小的（720P）

        // 从 media.stream 提取
        const media = videoData.media || {};
        const stream = media.stream || {};
        const codecs = ['h264', 'h265', 'av1'];

        for (const codec of codecs) {
            const codecList = stream[codec] || [];
            for (const s of codecList) {
                const w = s.width || 0;
                const h = s.height || 0;
                // 只取720P或更低
                if (w <= 1280 && h <= 720) {
                    const url = s.masterUrl || (s.backupUrls && s.backupUrls[0]) || '';
                    if (url) {
                        const size = (s.size || 0);
                        // 选择最小的720P（节省带宽）
                        if (size < bestSize) {
                            bestSize = size;
                            bestUrl = url;
                        }
                    }
                }
            }
        }

        // 从 mediaV2 提取
        const mediaV2Str = videoData.mediaV2 || '';
        if (!bestUrl && typeof mediaV2Str === 'string' && mediaV2Str.length > 0) {
            try {
                const mediaV2 = JSON.parse(mediaV2Str);
                if (mediaV2 && mediaV2.video && mediaV2.video.stream) {
                    const streamV2 = mediaV2.video.stream;
                    for (const codec of codecs) {
                        const codecList = streamV2[codec] || [];
                        for (const s of codecList) {
                            const w = s.width || 0;
                            const h = s.height || 0;
                            if (w <= 1280 && h <= 720) {
                                const url = s.master_url || (s.backup_urls && s.backup_urls[0]) || '';
                                if (url) {
                                    const size = (s.size || 0);
                                    if (size < bestSize) {
                                        bestSize = size;
                                        bestUrl = url;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch(e) {}
        }

        return bestUrl;
    } catch(e) {
        return null;
    }
}

async function init(cfg) {}

async function home(filter) {
    return JSON.stringify({
        class: [
            { type_id: 'all', type_name: '全部比赛' }
        ]
    });
}

async function homeVod() {
    // 尝试获取真实数据
    try {
        const url = host + '/worldcup26';
        const r = await req(url, { headers });

        if (r && r.content) {
            const state = extractState(r.content);
            if (state && state.worldCupMatch && state.worldCupMatch.matches) {
                const matches = state.worldCupMatch.matches;

                // 只取前10条，避免加载过多
                const limited = matches.slice(0, 10);

                const videos = limited.map(match => {
                    const home = match.homeTeamName || '主队';
                    const away = match.awayTeamName || '客队';
                    const score = (match.homeScore || '0') + '-' + (match.awayScore || '0');

                    return {
                        vod_id: match.matchId || '',
                        vod_name: home + ' vs ' + away,
                        vod_pic: match.homeTeamLogo || match.awayTeamLogo || placeholderImg,
                        vod_remarks: (match.statusDesc || '') + ' | ' + score,
                        vod_content: (match.roundStage || '') + ' ' + (match.matchTime || '')
                    };
                });

                return JSON.stringify({ list: videos });
            }
        }
    } catch(e) {}

    // fallback: 返回固定数据确保目录有内容
    return JSON.stringify({
        list: [
            {
                vod_id: '4459814',
                vod_name: '阿根廷 vs 巴西',
                vod_pic: placeholderImg,
                vod_remarks: '已结束 | 2-1',
                vod_content: '世界杯决赛'
            },
            {
                vod_id: '4459813',
                vod_name: '法国 vs 西班牙',
                vod_pic: placeholderImg,
                vod_remarks: '已结束 | 0-2',
                vod_content: '半决赛'
            }
        ]
    });
}

async function category(tid, pg, filter, extend) {
    return homeVod();
}

async function detail(id) {
    const matchUrl = host + '/worldcup26/match/' + id + '?wcup_source=web_main_venue_page';

    try {
        const r = await req(matchUrl, { headers });

        if (!r || !r.content) {
            return JSON.stringify({
                list: [{
                    vod_id: id,
                    vod_name: '请求失败',
                    vod_pic: placeholderImg,
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
                    vod_pic: placeholderImg,
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

        // 只提取 highList，且只取前3个（减少加载时间）
        const videos = [];
        const highList = matchInfo.highList || [];
        const limitedHighList = highList.slice(0, 3); // 只取前3个

        // 串行请求（避免并发过多导致风控）
        for (let i = 0; i < limitedHighList.length; i++) {
            const item = limitedHighList[i];
            if (item.noteId && item.type === 'video') {
                const videoUrl = await getNoteVideo720P(item.noteId, item.xsecToken || '');
                if (videoUrl) {
                    videos.push((item.title || '集锦' + (i + 1)) + '$' + videoUrl);
                }
            }
        }

        if (videos.length === 0) {
            videos.push('暂无720P集锦$https://www.baidu.com');
        }

        return JSON.stringify({
            list: [{
                vod_id: id,
                vod_name: homeTeam + ' vs ' + awayTeam,
                vod_pic: matchBase.homeTeamLogo || placeholderImg,
                vod_remarks: matchBase.statusDesc || '',
                vod_content: homeTeam + ' ' + homeScore + ' - ' + awayScore + ' ' + awayTeam,
                vod_play_from: '小红书720P',
                vod_play_url: videos.join('#')
            }]
        });

    } catch (e) {
        return JSON.stringify({
            list: [{
                vod_id: id,
                vod_name: '异常: ' + e.message,
                vod_pic: placeholderImg,
                vod_remarks: '错误',
                vod_content: '请求异常',
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
    // 直接播放（已经是720P视频地址）
    if (id && id.indexOf('http') === 0) {
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

    // 如果是笔记ID，尝试获取720P地址
    if (id && id.match(/^[a-f0-9]{24}$/i)) {
        const videoUrl = await getNoteVideo720P(id, '');
        if (videoUrl) {
            return JSON.stringify({
                parse: 0,
                url: videoUrl,
                header: {
                    'User-Agent': headers['User-Agent'],
                    'Referer': 'https://www.xiaohongshu.com/',
                    'Origin': 'https://www.xiaohongshu.com'
                }
            });
        }
    }

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

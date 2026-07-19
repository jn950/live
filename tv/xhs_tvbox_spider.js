const host = 'https://www.xiaohongshu.com';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none'
};

// 提取 window.__INITIAL_STATE__
function extractState(html) {
    if (!html || html.indexOf('window.__INITIAL_STATE__') === -1) return null;

    let match = html.match(/<script[^>]*>window\.__INITIAL_STATE__\s*=\s*({.+?})<\/script>/s);
    if (!match) {
        match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
    }
    if (!match) return null;

    let jsonStr = match[1];
    // 处理JS特殊值
    jsonStr = jsonStr.replace(/(?<=[:\[,\s])(undefined)(?=[\s:,\}\]])/g, 'null');
    jsonStr = jsonStr.replace(/NaN/g, 'null');

    try {
        return JSON.parse(jsonStr);
    } catch(e) {
        return null;
    }
}

// 获取笔记视频流（media + mediaV2）
async function getNoteVideo(noteId, xsecToken) {
    let noteUrl = host + '/explore/' + noteId;
    if (xsecToken) {
        noteUrl += '?xsec_token=' + encodeURIComponent(xsecToken) + '&xsec_source=pc_stab';
    }

    const r = await req(noteUrl, { headers });
    if (!r || !r.content) return { streams: [], bestStream: null };

    const state = extractState(r.content);
    if (!state) return { streams: [], bestStream: null };

    const streams = [];
    const noteData = state.note?.noteDetailMap?.[noteId]?.note || {};
    const videoData = noteData.video || {};

    // 1. 从 media 提取
    const media = videoData.media || {};
    const streamOld = media.stream || {};
    const codecs = ['h264', 'h265', 'av1', 'h266'];

    for (const codec of codecs) {
        if (streamOld[codec] && Array.isArray(streamOld[codec])) {
            for (const s of streamOld[codec]) {
                const url = s.masterUrl || (s.backupUrls && s.backupUrls[0]) || '';
                if (url) {
                    streams.push({
                        source: 'media',
                        codec: codec,
                        url: url,
                        width: s.width || 0,
                        height: s.height || 0,
                        fps: s.fps || 0,
                        duration: s.duration || s.videoDuration || 0,
                        size: s.size || 0,
                        bitrate: s.avgBitrate || 0,
                        quality: s.qualityType || ''
                    });
                }
            }
        }
    }

    // 2. 从 mediaV2 提取
    const mediaV2Str = videoData.mediaV2 || '';
    if (typeof mediaV2Str === 'string' && mediaV2Str.length > 0) {
        try {
            const mediaV2 = JSON.parse(mediaV2Str);
            if (mediaV2 && mediaV2.video) {
                const videoV2 = mediaV2.video;
                const streamV2 = videoV2.stream || {};

                for (const codec of codecs) {
                    if (streamV2[codec] && Array.isArray(streamV2[codec])) {
                        for (const s of streamV2[codec]) {
                            const url = s.master_url || (s.backup_urls && s.backup_urls[0]) || '';
                            if (url) {
                                streams.push({
                                    source: 'mediaV2',
                                    codec: codec,
                                    url: url,
                                    width: s.width || 0,
                                    height: s.height || 0,
                                    fps: s.fps || 0,
                                    duration: s.duration || 0,
                                    size: s.size || 0,
                                    bitrate: s.avg_bitrate || 0,
                                    quality: s.quality_type || ''
                                });
                            }
                        }
                    }
                }

                // opaque1 特殊流（投屏、4K等）
                const opaque1 = videoV2.opaque1 || {};
                for (const [key, url] of Object.entries(opaque1)) {
                    if (typeof url === 'string' && url.startsWith('http')) {
                        streams.push({
                            source: 'mediaV2.opaque1',
                            codec: 'unknown',
                            url: url,
                            width: 0,
                            height: 0,
                            quality: key
                        });
                    }
                }
            }
        } catch(e) {}
    }

    // 3. 去重并排序（按分辨率从高到低）
    const seen = new Set();
    const unique = [];
    for (const s of streams) {
        const urlBase = s.url.split('?')[0];
        if (!seen.has(urlBase)) {
            seen.add(urlBase);
            unique.push(s);
        }
    }

    unique.sort((a, b) => (b.width * b.height) - (a.width * a.height));

    return {
        streams: unique,
        bestStream: unique.length > 0 ? unique[0].url : null
    };
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
    const url = host + '/worldcup26';
    const r = await req(url, { headers });

    if (!r || !r.content) {
        return JSON.stringify({ list: [] });
    }

    const state = extractState(r.content);
    if (!state) {
        return JSON.stringify({ list: [] });
    }

    const matches = state.worldCupMatch?.matches || [];
    const videos = matches.map(match => ({
        vod_id: match.matchId || '',
        vod_name: (match.homeTeamName || '') + ' vs ' + (match.awayTeamName || ''),
        vod_pic: match.homeTeamLogo || '',
        vod_remarks: (match.statusDesc || '') + ' | ' + (match.homeScore || '0') + '-' + (match.awayScore || '0'),
        vod_content: (match.roundStage || '') + ' ' + (match.matchTime || '')
    }));

    return JSON.stringify({ list: videos });
}

async function category(tid, pg, filter, extend) {
    return homeVod();
}

async function detail(id) {
    const matchUrl = host + '/worldcup26/match/' + id + '?wcup_source=web_main_venue_page';
    const r = await req(matchUrl, { headers });

    if (!r || !r.content) {
        return JSON.stringify({ list: [] });
    }

    const state = extractState(r.content);
    if (!state) {
        return JSON.stringify({ list: [] });
    }

    const matchBase = state.worldCupMatch?.matchBase || {};
    const matchInfo = state.worldCupMatch?.matchInfo || {};

    const homeTeam = matchBase.homeTeamName || '';
    const awayTeam = matchBase.awayTeamName || '';
    const homeScore = matchBase.homeScore || '0';
    const awayScore = matchBase.awayScore || '0';

    // 收集所有视频
    const videos = [];

    // 1. 最高优先级：官方全场回放
    const liveInfo = matchBase.liveInfo || {};
    if (liveInfo.replayNoteId) {
        const videoData = await getNoteVideo(liveInfo.replayNoteId, liveInfo.xsecToken || '');
        if (videoData.bestStream) {
            videos.push('官方全场回放$' + videoData.bestStream);
        }
    }

    // 2. reportList 战报列表
    const reportList = matchInfo.reportList || [];
    for (let i = 0; i < reportList.length; i++) {
        const item = reportList[i];
        if (item.noteId && item.type === 'video') {
            const videoData = await getNoteVideo(item.noteId, item.xsecToken || '');
            if (videoData.bestStream) {
                const title = item.title || ('战报' + (i + 1));
                videos.push(title + '$' + videoData.bestStream);
            }
        }
    }

    // 3. highList 高光列表
    const highList = matchInfo.highList || [];
    for (let i = 0; i < highList.length; i++) {
        const item = highList[i];
        if (item.noteId && item.type === 'video') {
            const videoData = await getNoteVideo(item.noteId, item.xsecToken || '');
            if (videoData.bestStream) {
                const title = item.title || ('高光' + (i + 1));
                videos.push(title + '$' + videoData.bestStream);
            }
        }
    }

    // 4. 其他可能的列表
    const otherLists = [];
    if (matchInfo.noteList) otherLists.push(...matchInfo.noteList);
    if (matchInfo.videoList) otherLists.push(...matchInfo.videoList);

    for (let i = 0; i < otherLists.length; i++) {
        const item = otherLists[i];
        if (item.noteId && item.type === 'video') {
            const videoData = await getNoteVideo(item.noteId, item.xsecToken || '');
            if (videoData.bestStream) {
                const title = item.title || ('其他' + (i + 1));
                videos.push(title + '$' + videoData.bestStream);
            }
        }
    }

    // 如果没有视频，添加提示
    if (videos.length === 0) {
        videos.push('暂无视频$https://www.baidu.com');
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
                        '阶段: ' + (matchBase.roundStage || '') + '\n' +
                        'reportList: ' + reportList.length + '条\n' +
                        'highList: ' + highList.length + '条',
            vod_play_from: '小红书',
            vod_play_url: videos.join('#')
        }]
    });
}

async function search(wd, quick, pg) {
    return JSON.stringify({ page: pg, list: [] });
}

async function play(flag, id, flags) {
    // id 已经是真实视频URL（在detail中已解析）
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

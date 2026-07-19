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

// ========== 数据缓存 ==========
let matchDataCache = null;

async function getMatchData() {
    if (matchDataCache) return matchDataCache;

    const r = await req(host + '/worldcup26', { headers });
    if (!r || !r.content) return null;

    const state = extractState(r.content);
    if (!state || !state.worldCupMatch) return null;

    matchDataCache = state.worldCupMatch;
    return matchDataCache;
}

// ========== TVBOX 接口 ==========

async function init(cfg) {}

async function home(filter) {
    // 四个固定一级菜单
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
    // 首页直接显示所有比赛卡片
    const data = await getMatchData();
    if (!data || !data.matches) {
        return JSON.stringify({ list: [] });
    }

    const matches = data.matches;
    const list = [];

    for (const match of matches) {
        // 构建比赛信息
        const matchId = match.matchId || '';
        const homeTeam = match.homeTeamName || '';
        const awayTeam = match.awayTeamName || '';
        const homeScore = match.homeScore ?? '';
        const awayScore = match.awayScore ?? '';
        const status = match.statusDesc || '';
        const round = match.roundStage || '';
        const matchTime = match.matchTime || '';

        // 背景图：使用主场队或客场队logo，或比赛封面
        let bgPic = match.coverImage || match.homeTeamLogo || match.awayTeamLogo || '';

        // 构建显示标题
        let title = homeTeam + ' vs ' + awayTeam;
        if (homeScore !== '' && awayScore !== '') {
            title += ' ' + homeScore + '-' + awayScore;
        }

        // 构建副标题
        let subTitle = round;
        if (matchTime) {
            subTitle += ' | ' + matchTime;
        }
        if (status) {
            subTitle += ' | ' + status;
        }

        list.push({
            vod_id: matchId,
            vod_name: title,
            vod_pic: bgPic,
            vod_remarks: subTitle,
            vod_content: homeTeam + ' vs ' + awayTeam + '\n' +
                        '比分: ' + homeScore + ' - ' + awayScore + '\n' +
                        '阶段: ' + round + '\n' +
                        '时间: ' + matchTime + '\n' +
                        '状态: ' + status
        });
    }

    return JSON.stringify({ list: list });
}

async function category(tid, pg, filter, extend) {
    // tid 是分类ID: replay, highlight, report, high
    // 这里需要显示所有比赛，但标记为某个分类
    // 实际上我们返回所有比赛，用户点击后再根据分类提取视频

    const data = await getMatchData();
    if (!data || !data.matches) {
        return JSON.stringify({ list: [] });
    }

    const matches = data.matches;
    const list = [];

    const categoryNames = {
        'replay': '全场回放',
        'highlight': '全场集锦',
        'report': '战报',
        'high': '高光时刻'
    };

    for (const match of matches) {
        const matchId = match.matchId || '';
        const homeTeam = match.homeTeamName || '';
        const awayTeam = match.awayTeamName || '';
        const homeScore = match.homeScore ?? '';
        const awayScore = match.awayScore ?? '';
        const status = match.statusDesc || '';
        const round = match.roundStage || '';

        let bgPic = match.coverImage || match.homeTeamLogo || match.awayTeamLogo || '';

        let title = homeTeam + ' vs ' + awayTeam;
        if (homeScore !== '' && awayScore !== '') {
            title += ' ' + homeScore + '-' + awayScore;
        }

        // 在ID中编码分类信息: matchId#category
        list.push({
            vod_id: matchId + '#' + tid,
            vod_name: title,
            vod_pic: bgPic,
            vod_remarks: categoryNames[tid] || tid,
            vod_content: '分类: ' + (categoryNames[tid] || tid) + '\n' +
                        homeTeam + ' ' + homeScore + ' - ' + awayScore + ' ' + awayTeam + '\n' +
                        '阶段: ' + round + '\n' +
                        '状态: ' + status
        });
    }

    return JSON.stringify({ list: list });
}

async function detail(id) {
    // 解析ID: matchId#category 或 纯 matchId
    let matchId = id;
    let category = 'replay'; // 默认分类

    if (id.indexOf('#') !== -1) {
        const parts = id.split('#');
        matchId = parts[0];
        category = parts[1];
    }

    const categoryNames = {
        'replay': '全场回放',
        'highlight': '全场集锦',
        'report': '战报',
        'high': '高光时刻'
    };

    // 先获取比赛基本信息
    const data = await getMatchData();
    if (!data || !data.matches) {
        return JSON.stringify({
            list: [{
                vod_id: id,
                vod_name: '数据获取失败',
                vod_pic: '',
                vod_remarks: '',
                vod_content: '无法获取比赛数据',
                vod_play_from: '测试',
                vod_play_url: '测试$https://www.baidu.com'
            }]
        });
    }

    // 找到对应比赛
    const match = data.matches.find(m => m.matchId === matchId);
    if (!match) {
        return JSON.stringify({
            list: [{
                vod_id: id,
                vod_name: '比赛未找到: ' + matchId,
                vod_pic: '',
                vod_remarks: '',
                vod_content: 'ID: ' + id,
                vod_play_from: '测试',
                vod_play_url: '测试$https://www.baidu.com'
            }]
        });
    }

    const homeTeam = match.homeTeamName || '';
    const awayTeam = match.awayTeamName || '';
    const homeScore = match.homeScore ?? '';
    const awayScore = match.awayScore ?? '';

    // 这里先不提取真实视频，只显示框架
    // 视频地址使用占位符，格式为: matchId@category@index
    // 实际播放时再提取
    const videos = [];

    // 根据分类生成占位视频项
    if (category === 'replay') {
        videos.push('官方全场回放$match://' + matchId + '@replay@0');
    } else if (category === 'highlight') {
        videos.push('全场集锦$match://' + matchId + '@highlight@0');
    } else if (category === 'report') {
        videos.push('战报视频1$match://' + matchId + '@report@0');
        videos.push('战报视频2$match://' + matchId + '@report@1');
    } else if (category === 'high') {
        videos.push('高光时刻1$match://' + matchId + '@high@0');
        videos.push('高光时刻2$match://' + matchId + '@high@1');
        videos.push('高光时刻3$match://' + matchId + '@high@2');
    }

    return JSON.stringify({
        list: [{
            vod_id: id,
            vod_name: homeTeam + ' vs ' + awayTeam + ' - ' + (categoryNames[category] || category),
            vod_pic: match.coverImage || match.homeTeamLogo || '',
            vod_remarks: match.statusDesc || '',
            vod_content: homeTeam + ' ' + homeScore + ' - ' + awayScore + ' ' + awayTeam + '\n' +
                        '分类: ' + (categoryNames[category] || category) + '\n' +
                        '阶段: ' + (match.roundStage || '') + '\n' +
                        '时间: ' + (match.matchTime || '') + '\n' +
                        '状态: ' + (match.statusDesc || '') + '\n' +
                        '\n[框架测试模式 - 点击播放将提取真实视频]',
            vod_play_from: '小红书',
            vod_play_url: videos.join('#')
        }]
    });
}

async function search(wd, quick, pg) {
    return JSON.stringify({ page: pg, list: [] });
}

async function play(flag, id, flags) {
    // 解析占位符: match://matchId@category@index
    if (id && id.indexOf('match://') === 0) {
        const parts = id.replace('match://', '').split('@');
        const matchId = parts[0];
        const category = parts[1];
        const index = parseInt(parts[2] || '0');

        // 这里后续会添加真实视频提取逻辑
        // 目前返回提示信息
        return JSON.stringify({
            parse: 1,
            url: 'https://www.xiaohongshu.com/worldcup26/match/' + matchId,
            header: {
                'User-Agent': headers['User-Agent'],
                'Referer': 'https://www.xiaohongshu.com/',
                'Origin': 'https://www.xiaohongshu.com'
            }
        });
    }

    // 如果是真实URL，直接播放
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

    return JSON.stringify({
        parse: 0,
        url: id
    });
}

export default { init, home, homeVod, category, detail, search, play };

var rule = {
    title: '小红书世界杯',
    host: 'https://www.xiaohongshu.com',
    url: '/worldcup26/match/fyclass',
    searchUrl: '',
    searchable: 0,
    quickSearch: 0,
    filterable: 0,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.xiaohongshu.com/'
    },

    // 首页分类
    class_name: '全部比赛&小组赛&淘汰赛&决赛',
    class_url: 'all&group&knockout&final',

    // 提取页面中的 window.__INITIAL_STATE__
    extractState: function(html) {
        if (html.indexOf('window.__INITIAL_STATE__') === -1) {
            return null;
        }
        var match = html.match(/<script[^>]*>window\.__INITIAL_STATE__\s*=\s*({.+?})<\/script>/s);
        if (!match) {
            match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
        }
        if (!match) return null;

        var jsonStr = match[1];
        // 处理JS特殊值
        jsonStr = jsonStr.replace(/(?<=[:\[,\s])(undefined)(?=[\s:,\}\]])/g, 'null');
        jsonStr = jsonStr.replace(/NaN/g, 'null');

        try {
            return JSON.parse(jsonStr);
        } catch(e) {
            return null;
        }
    },

    // 获取笔记页面的视频流
    getNoteVideo: function(noteId, xsecToken) {
        var noteUrl = 'https://www.xiaohongshu.com/explore/' + noteId;
        if (xsecToken) {
            noteUrl += '?xsec_token=' + encodeURIComponent(xsecToken) + '&xsec_source=pc_stab';
        }

        var html = request(noteUrl, {
            headers: this.headers
        });

        if (!html) return {streams: [], bestStream: null};

        var state = this.extractState(html);
        if (!state) return {streams: [], bestStream: null};

        var streams = [];
        var noteData = state.note && state.note.noteDetailMap && state.note.noteDetailMap[noteId] && state.note.noteDetailMap[noteId].note || {};
        var videoData = noteData.video || {};

        // 从 media 提取
        var media = videoData.media || {};
        var streamOld = media.stream || {};
        var codecs = ['h264', 'h265', 'av1', 'h266'];

        for (var i = 0; i < codecs.length; i++) {
            var codec = codecs[i];
            if (streamOld[codec] && Array.isArray(streamOld[codec])) {
                for (var j = 0; j < streamOld[codec].length; j++) {
                    var s = streamOld[codec][j];
                    var url = s.masterUrl || (s.backupUrls && s.backupUrls[0]) || '';
                    if (url) {
                        streams.push({
                            source: 'media',
                            codec: codec,
                            url: url,
                            width: s.width || 0,
                            height: s.height || 0,
                            quality: s.qualityType || ''
                        });
                    }
                }
            }
        }

        // 从 mediaV2 提取
        var mediaV2Str = videoData.mediaV2 || '';
        if (typeof mediaV2Str === 'string' && mediaV2Str.length > 0) {
            try {
                var mediaV2 = JSON.parse(mediaV2Str);
                if (mediaV2 && mediaV2.video) {
                    var videoV2 = mediaV2.video;
                    var streamV2 = videoV2.stream || {};

                    for (var i = 0; i < codecs.length; i++) {
                        var codec = codecs[i];
                        if (streamV2[codec] && Array.isArray(streamV2[codec])) {
                            for (var j = 0; j < streamV2[codec].length; j++) {
                                var s = streamV2[codec][j];
                                var url = s.master_url || (s.backup_urls && s.backup_urls[0]) || '';
                                if (url) {
                                    streams.push({
                                        source: 'mediaV2',
                                        codec: codec,
                                        url: url,
                                        width: s.width || 0,
                                        height: s.height || 0,
                                        quality: s.quality_type || ''
                                    });
                                }
                            }
                        }
                    }
                }
            } catch(e) {}
        }

        // 去重并排序
        var seen = {};
        var unique = [];
        for (var i = 0; i < streams.length; i++) {
            var urlBase = streams[i].url.split('?')[0];
            if (!seen[urlBase]) {
                seen[urlBase] = true;
                unique.push(streams[i]);
            }
        }

        unique.sort(function(a, b) {
            return (b.width * b.height) - (a.width * a.height);
        });

        return {
            streams: unique,
            bestStream: unique.length > 0 ? unique[0].url : null
        };
    },

    // 首页内容
    homeContent: function(filter) {
        var html = request(this.host + '/worldcup26', {
            headers: this.headers
        });

        if (!html) return {class: [], list: []};

        var state = this.extractState(html);
        if (!state) return {class: [], list: []};

        var matches = state.worldCupMatch && state.worldCupMatch.matches || [];
        var list = [];

        for (var i = 0; i < matches.length; i++) {
            var match = matches[i];
            list.push({
                vod_id: match.matchId || '',
                vod_name: (match.homeTeamName || '') + ' vs ' + (match.awayTeamName || ''),
                vod_pic: match.homeTeamLogo || '',
                vod_remarks: match.statusDesc || '',
                vod_content: (match.homeScore || '0') + ' - ' + (match.awayScore || '0')
            });
        }

        return {
            class: [
                {type_id: 'all', type_name: '全部比赛'},
                {type_id: 'group', type_name: '小组赛'},
                {type_id: 'knockout', type_name: '淘汰赛'},
                {type_id: 'final', type_name: '决赛'}
            ],
            list: list
        };
    },

    // 分类内容
    categoryContent: function(tid, pg, filter, extend) {
        // 这里简化处理，实际应该根据tid过滤
        return this.homeContent(filter);
    },

    // 详情内容
    detailContent: function(ids) {
        var matchId = ids[0];
        var matchUrl = this.host + '/worldcup26/match/' + matchId + '?wcup_source=web_main_venue_page';

        var html = request(matchUrl, {
            headers: this.headers
        });

        if (!html) return {list: []};

        var state = this.extractState(html);
        if (!state) return {list: []};

        var matchBase = state.worldCupMatch && state.worldCupMatch.matchBase || {};
        var matchInfo = state.worldCupMatch && state.worldCupMatch.matchInfo || {};

        var homeTeam = matchBase.homeTeamName || '';
        var awayTeam = matchBase.awayTeamName || '';
        var homeScore = matchBase.homeScore || '0';
        var awayScore = matchBase.awayScore || '0';

        // 收集所有视频
        var videos = [];
        var playUrls = [];

        // 1. 官方回放
        var liveInfo = matchBase.liveInfo || {};
        var replayNoteId = liveInfo.replayNoteId;
        if (replayNoteId) {
            var videoData = this.getNoteVideo(replayNoteId, liveInfo.xsecToken || '');
            if (videoData.bestStream) {
                videos.push('官方全场回放$' + videoData.bestStream);
                playUrls.push(videoData.bestStream);
            }
        }

        // 2. reportList
        var reportList = matchInfo.reportList || [];
        for (var i = 0; i < reportList.length; i++) {
            var item = reportList[i];
            if (item.noteId && item.type === 'video') {
                var videoData = this.getNoteVideo(item.noteId, item.xsecToken || '');
                if (videoData.bestStream) {
                    var title = item.title || ('战报' + (i + 1));
                    videos.push(title + '$' + videoData.bestStream);
                    playUrls.push(videoData.bestStream);
                }
            }
        }

        // 3. highList
        var highList = matchInfo.highList || [];
        for (var i = 0; i < highList.length; i++) {
            var item = highList[i];
            if (item.noteId && item.type === 'video') {
                var videoData = this.getNoteVideo(item.noteId, item.xsecToken || '');
                if (videoData.bestStream) {
                    var title = item.title || ('高光' + (i + 1));
                    videos.push(title + '$' + videoData.bestStream);
                    playUrls.push(videoData.bestStream);
                }
            }
        }

        var vod = {
            vod_id: matchId,
            vod_name: homeTeam + ' vs ' + awayTeam,
            vod_pic: matchBase.homeTeamLogo || '',
            vod_remarks: matchBase.statusDesc || '',
            vod_content: homeTeam + ' ' + homeScore + ' - ' + awayScore + ' ' + awayTeam + '\n' + 
                        '比赛时间: ' + (matchBase.matchTime || '') + '\n' +
                        '场地: ' + (matchBase.venue || '') + '\n' +
                        '阶段: ' + (matchBase.roundStage || ''),
            vod_play_from: '小红书',
            vod_play_url: videos.join('#')
        };

        return {
            list: [vod]
        };
    },

    // 搜索
    searchContent: function(key, quick) {
        return {list: []};
    },

    // 播放
    playerContent: function(flag, id, vipFlags) {
        return {
            parse: 0,
            url: id,
            header: {
                'User-Agent': this.headers['User-Agent'],
                'Referer': 'https://www.xiaohongshu.com/',
                'Origin': 'https://www.xiaohongshu.com'
            }
        };
    }
};

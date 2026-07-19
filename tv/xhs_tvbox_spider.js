var rule = {
    title: '测试',
    host: 'https://www.baidu.com',
    url: '',
    class_name: '测试',
    class_url: 'test',
    homeContent: function(filter) {
        return {
            class: [{type_id: 'test', type_name: '测试'}],
            list: [{
                vod_id: '1',
                vod_name: '测试视频',
                vod_pic: '',
                vod_remarks: '测试'
            }]
        };
    }
};

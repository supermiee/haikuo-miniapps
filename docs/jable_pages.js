/* Jable 完整版页面层。优先使用订阅模块，本地文件可作为离线后备。 */
(function () {
    var MODULE_VERSION = '17';
    var PUBLISH_BASE = 'https://supermiee.github.io/haikuo-miniapps/';
    var CORE_PATH = 'hiker://files/rules/jable/jable_core.js';
    var PAGES_PATH = 'hiker://files/rules/jable/jable_pages.js';
    var CORE_URL = PUBLISH_BASE + 'jable_core.js?v=' + MODULE_VERSION;
    var PAGES_URL = PUBLISH_BASE + 'jable_pages.js?v=' + MODULE_VERSION;

    function remoteModule(url, fallbackPath) {
        try { return requirejs(url); } catch (ignore) { return $.require(fallbackPath); }
    }

    function core() { return remoteModule(CORE_URL, CORE_PATH); }
    function pages() { return remoteModule(PAGES_URL, PAGES_PATH); }

    function queryValue(url, key) {
        var match = new RegExp('[?&]' + key + '=([^&#\\]]*)', 'i').exec(String(url || ''));
        return match ? match[1] : '';
    }

    function isSearchUrl(url, title) {
        return title === '搜索' || /\/search(?:\/|[?#]|$)/i.test(String(url || ''));
    }

    function searchSorts(url) {
        var keyword = queryValue(url, 'q');
        if (!keyword) return [];
        var selected = queryValue(url, 'sort_by') || 'avg_videos_popularity';
        var options = [
            { title: '名称排序', value: 'title' },
            { title: '热度优先', value: 'avg_videos_popularity' },
            { title: '最近更新', value: 'last_content_date' },
            { title: '最多影片', value: 'total_videos' }
        ];
        var root = core().config.sources[0] + '/search/?q=' + keyword;
        for (var i = 0; i < options.length; i++) {
            options[i].url = root + '&sort_by=' + options[i].value;
            options[i].selected = options[i].value === selected;
        }
        return options;
    }

    function retry(url, title) {
        return $('hiker://empty').rule(function (params) {
            try { requirejs('https://supermiee.github.io/haikuo-miniapps/jable_pages.js?v=17').renderList(params); } catch (ignore) { $.require('hiker://files/rules/jable/jable_pages.js').renderList(params); }
        }, { url: url, title: title || '重试' });
    }

    function failure(error, originalUrl) {
        var message = error && error.message || '页面加载失败';
        return [
            { title: message, desc: '可重试，或打开原网页查看。', col_type: 'text_center_1' },
            { title: '重试', url: retry(originalUrl), col_type: 'text_center_1' },
            { title: '打开原网页', url: 'web://' + originalUrl, col_type: 'text_center_1' }
        ];
    }

    function pagedSource(url) {
        var pageSource = String(url || '');
        var firstPage = pageSource;
        var pair = pageSource.split('?');
        var path = pair[0].replace(/\/\d+\/?$/, '/');
        if (path.charAt(path.length - 1) !== '/') path += '/';
        return path + 'fypage/' + (pair.length > 1 ? ('?' + pair.slice(1).join('?')) : '') + '[firstPage=' + firstPage + ']';
    }

    function routeList(url, title) {
        var pageSource = pagedSource(url);
        return $('hiker://empty#' + pageSource).rule(function (params) {
            var source = String(MY_URL || '').split('#')[1] || params.url;
            source = source.split('@rule=')[0];
            try { requirejs('https://supermiee.github.io/haikuo-miniapps/jable_pages.js?v=17').renderList({ url: source, title: params.title }); } catch (ignore) { $.require('hiker://files/rules/jable/jable_pages.js').renderList({ url: source, title: params.title }); }
        }, { url: url, title: title || '视频列表' });
    }

    function routeModels(url, title) {
        var pageSource = pagedSource(url);
        return $('hiker://empty#' + pageSource).rule(function (params) {
            var source = String(MY_URL || '').split('#')[1] || params.url;
            source = source.split('@rule=')[0];
            try { requirejs('https://supermiee.github.io/haikuo-miniapps/jable_pages.js?v=17').renderModels({ url: source, title: params.title }); } catch (ignore) { $.require('hiker://files/rules/jable/jable_pages.js').renderModels({ url: source, title: params.title }); }
        }, { url: url, title: title || '女优' });
    }

    function routeDetail(item) {
        return $('hiker://empty').rule(function (params) {
            try { requirejs('https://supermiee.github.io/haikuo-miniapps/jable_pages.js?v=17').renderDetail(params); } catch (ignore) { $.require('hiker://files/rules/jable/jable_pages.js').renderDetail(params); }
        }, { url: item.url, title: item.title || '', image: item.image || '' });
    }

    function routePage(name, title) {
        return $('hiker://empty').rule(function (params) {
            try { requirejs('https://supermiee.github.io/haikuo-miniapps/jable_pages.js?v=17')[params.name](); } catch (ignore) { $.require('hiker://files/rules/jable/jable_pages.js')[params.name](); }
        }, { name: name, title: title || '' });
    }

    function card(item) {
        return {
            title: item.title,
            pic_url: item.image || '',
            desc: item.duration ? ('时长：' + item.duration) : '点击查看详情',
            url: routeDetail(item),
            col_type: 'movie_2'
        };
    }

    function searchCard(item) {
        return {
            title: item.title,
            pic_url: item.image || '',
            desc: item.duration ? ('时长：' + item.duration) : '点击查看详情',
            url: routeDetail(item),
            col_type: 'pic_2',
            extra: { lineVisible: false }
        };
    }

    function section(result, title, items, moreUrl) {
        result.push({ title: title, col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (moreUrl) result.push({ title: '查看全部', url: moreUrl, col_type: 'text_center_1' });
    }

    function renderHome() {
        var app = core();
        var latestUrl = app.config.sources[0] + '/latest-updates/';
        var latest = app.getList(latestUrl, '/videos/', app.config.limits.home);
        if (!latest.ok) { setHomeResult(failure(latest.error, latestUrl)); return; }
        var result = [];
        result.push({
            title: '搜索',
            url: "input ? 'hiker://search?s=' + encodeURIComponent(input) + '&rule=' + encodeURIComponent('Jable') : 'toast://请输入关键词'",
            col_type: 'input',
            extra: { defaultValue: '' }
        });
        result.push({ title: '主题', url: routePage('renderTaxonomy', '主题'), col_type: 'scroll_button' });
        result.push({ title: '女优', url: routeModels(app.config.sources[0] + '/models/', '女优'), col_type: 'scroll_button' });
        result.push({ title: '收藏', url: routePage('renderFavorites', '收藏'), col_type: 'scroll_button' });
        result.push({ title: '历史', url: routePage('renderHistory', '历史'), col_type: 'scroll_button' });
        result.push({ title: '语言：' + app.languageInfo().title, url: routePage('renderLanguages', '语言'), col_type: 'scroll_button' });
        result.push({ title: '设置', url: routePage('renderSettings', '设置'), col_type: 'scroll_button' });
        section(result, '最近更新', latest.items, routeList(latestUrl, '最近更新'));
        var fresh = app.getList(app.config.sources[0] + '/new-release/', '/videos/', 6);
        if (fresh.ok && fresh.items.length) section(result, '新片优先', fresh.items, routeList(app.config.sources[0] + '/new-release/', '新片优先'));
        var hot = app.getList(app.config.sources[0] + '/hot/?t=week', '/videos/', 6);
        if (hot.ok && hot.items.length) section(result, '本周热门', hot.items, routeList(app.config.sources[0] + '/hot/?t=week', '本周热门'));
        setHomeResult(result);
    }

    function renderList(params) {
        var app = core();
        params = params || {};
        var data = app.getList(params.url, '/videos/');
        if (!data.ok) { setResult(failure(data.error, params.url)); return; }
        try { setPageTitle(params.title || '视频列表'); } catch (ignore) {}
        var pageNumber = 1;
        try { pageNumber = Number(MY_PAGE || 1); } catch (ignorePage) {}
        var result = [];
        var searching = isSearchUrl(params.url, params.title);
        if (pageNumber <= 1) {
            result.push({ title: params.title || '视频列表', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } });
            if (searching) {
                var sorts = searchSorts(params.url);
                for (var s = 0; s < sorts.length; s++) {
                    result.push({
                        title: (sorts[s].selected ? '✓ ' : '') + sorts[s].title,
                        url: routeList(sorts[s].url, '搜索'),
                        col_type: 'scroll_button'
                    });
                }
            }
        }
        if (!data.items.length) result.push({ title: '未解析到视频，可能页面结构已变化。', url: 'web://' + data.page.url, col_type: 'text_center_1' });
        for (var i = 0; i < data.items.length; i++) result.push(searching ? searchCard(data.items[i]) : card(data.items[i]));
        setResult(result);
    }

    function renderDetail(params) {
        var app = core();
        var page = app.fetchCached(params.url, { marker: 'og:title' }, 1800);
        if (!page.ok) { setResult(failure(page.error, params.url)); return; }
        var detail = app.parseDetail(page);
        app.addHistory({ title: detail.title || params.title, image: detail.image || params.image, url: params.url });
        try { setPageTitle(detail.title || params.title || '视频详情'); } catch (ignoreTitle) {}
        try { if (detail.image) setPagePicUrl(detail.image); } catch (ignoreImage) {}
        var result = [];
        if (detail.image) result.push({ pic_url: detail.image, col_type: 'pic_1_full', extra: { lineVisible: false } });
        result.push({ title: detail.title || params.title || '视频详情', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } });
        var metadata = [];
        if (detail.isNew) metadata.push('新片');
        if (detail.relativeTime) metadata.push(detail.relativeTime);
        if (detail.publishedAt) metadata.push('上映：' + detail.publishedAt);
        if (detail.views) metadata.push('观看：' + detail.views);
        if (detail.favoriteCount) metadata.push('收藏：' + detail.favoriteCount);
        if (metadata.length) result.push({ title: metadata.join('  ·  '), col_type: 'text_1', extra: { textSize: 13, lineVisible: false } });
        if (detail.description) result.push({ title: detail.description, col_type: 'rich_text', extra: { textSize: 14, lineVisible: false } });
        result.push({ title: detail.media ? '▶ 立即播放' : '打开原网页播放', url: detail.media ? JSON.stringify({ urls: [detail.media], names: ['默认线路'], headers: [{ Referer: page.url, 'User-Agent': app.config.userAgent }] }) : 'web://' + page.url, col_type: 'text_center_1', extra: { lineVisible: false } });
        result.push({ title: '收藏 / 取消收藏', url: $('hiker://empty').lazyRule(function (item) {
            var app;
            try { app = requirejs('https://supermiee.github.io/haikuo-miniapps/jable_core.js?v=17'); } catch (ignore) { app = $.require('hiker://files/rules/jable/jable_core.js'); }
            var added = app.toggleFavorite(item);
            return 'toast://' + (added ? '已收藏' : '已取消收藏');
        }, { title: detail.title || params.title, image: detail.image || params.image, url: params.url }), col_type: 'flex_button' });
        result.push({ title: '在网页打开', url: 'web://' + page.url, col_type: 'flex_button' });
        if (detail.actors.length) {
            result.push({ title: '演员', col_type: 'long_text', extra: { lineVisible: false } });
            for (var i = 0; i < detail.actors.length; i++) result.push({ title: detail.actors[i].title, url: routeList(detail.actors[i].url, detail.actors[i].title), col_type: 'flex_button' });
        }
        if (detail.tags.length) {
            result.push({ title: '标签与主题', col_type: 'long_text', extra: { lineVisible: false } });
            for (var j = 0; j < detail.tags.length; j++) result.push({ title: detail.tags[j].title, url: routeList(detail.tags[j].url, detail.tags[j].title), col_type: 'flex_button' });
        }
        if (detail.comments.length) {
            result.push({ title: '公开评论（只读）', col_type: 'long_text', extra: { lineVisible: false } });
            for (var k = 0; k < detail.comments.length; k++) result.push({ title: detail.comments[k], col_type: 'text_1' });
        }
        if (detail.recommendations.length) section(result, '猜你喜欢', detail.recommendations);
        setResult(result);
    }

    function renderTaxonomy() {
        var app = core();
        var page = app.fetchCached(app.config.sources[0] + '/categories/', { marker: '/categories/' }, 43200);
        if (!page.ok) { setResult(failure(page.error, app.config.sources[0] + '/categories/')); return; }
        try { setPageTitle('主题与标签'); } catch (ignore) {}
        var groups = app.parseTaxonomy(page.html, page.url);
        var result = [{ title: '主题与标签', desc: '完整目录来自网页真实链接', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        for (var i = 0; i < groups.length; i++) {
            result.push({ title: groups[i].title, col_type: 'long_text', extra: { lineVisible: false } });
            for (var j = 0; j < groups[i].items.length; j++) result.push({ title: groups[i].items[j].title, url: routeList(groups[i].items[j].url, groups[i].items[j].title), col_type: 'flex_button' });
        }
        if (groups.length === 0) result.push({ title: '未解析到主题目录', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }

    function renderModels(params) {
        var app = core();
        params = params || {};
        var url = params.url || app.config.sources[0] + '/models/';
        var page = app.fetchCached(url, { marker: '/models/' }, 21600);
        if (!page.ok) { setResult(failure(page.error, url)); return; }
        try { setPageTitle(params.title || '女优'); } catch (ignore) {}
        var models = app.parseModels(page.html, page.url);
        var sorts = app.parseModelSorts(page.html, page.url);
        var pageNumber = 1;
        try { pageNumber = Number(MY_PAGE || 1); } catch (ignorePage) {}
        var result = [];
        if (pageNumber <= 1) {
            result.push({ title: '女优目录', desc: '向下滚动自动加载更多女优。', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } });
            var selected = ((String(url).match(/[?&]sort_by=([^&]+)/) || [])[1] || 'avg_videos_popularity');
            for (var s = 0; s < sorts.length; s++) {
                result.push({
                    title: (sorts[s].value === selected ? '✓ ' : '') + sorts[s].title,
                    url: routeModels(sorts[s].url, '女优'),
                    col_type: 'scroll_button'
                });
            }
        }
        for (var i = 0; i < models.length; i++) {
            result.push({
                title: models[i].title + (models[i].count ? ('\n' + models[i].count + ' 部影片') : ''),
                url: routeList(models[i].url, models[i].title),
                col_type: 'text_2',
                extra: { textAlign: 'left' }
            });
        }
        if (!models.length) result.push({ title: '未解析到女优目录', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }

    function renderFavorites() { renderLocalList('favorites', '收藏', 'savedAt'); }
    function renderHistory() { renderLocalList('history', '观看历史', 'watchedAt'); }

    function renderLocalList(key, title) {
        var app = core();
        var items = app.listValue(key, []);
        try { setPageTitle(title); } catch (ignore) {}
        var result = [{ title: title, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        if (!items.length) result.push({ title: '暂无内容', col_type: 'text_center_1' });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        setResult(result);
    }

    function renderSettings() {
        var app = core();
        try { setPageTitle('设置与诊断'); } catch (ignore) {}
        setResult([
            { title: '设置与诊断', desc: '版本 ' + app.config.version, col_type: 'long_text', extra: { textSize: 19, lineVisible: false } },
            { title: '界面与站点语言：' + app.languageInfo().title, url: routePage('renderLanguages', '语言'), col_type: 'text_center_1' },
            { title: '搜索历史', desc: app.listValue('searches', []).join(' · ') || '暂无', col_type: 'text_1' },
            { title: '查看诊断日志', url: routePage('renderDiagnostics', '诊断日志'), col_type: 'text_center_1' },
            { title: '清除缓存与本地数据', url: $('hiker://empty').lazyRule(function () {
                try { requirejs('https://supermiee.github.io/haikuo-miniapps/jable_core.js?v=17').clearLocal(); } catch (ignore) { $.require('hiker://files/rules/jable/jable_core.js').clearLocal(); }
                return 'toast://已清除';
            }), col_type: 'text_center_1' }
        ]);
    }

    function renderLanguages() {
        var app = core();
        try { setPageTitle('语言'); } catch (ignore) {}
        var selected = app.getLanguage();
        var result = [{ title: '语言', desc: '切换后重新从站点获取标题、分类、标签和演员显示文本。', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        for (var i = 0; i < app.config.languages.length; i++) {
            var item = app.config.languages[i];
            result.push({
                title: (item.id === selected ? '✓ ' : '') + item.title,
                url: $('hiker://empty').lazyRule(function (languageId) {
                    try { requirejs('https://supermiee.github.io/haikuo-miniapps/jable_core.js?v=17').setLanguage(languageId); } catch (ignore) { $.require('hiker://files/rules/jable/jable_core.js').setLanguage(languageId); }
                    refreshPage();
                    return 'toast://语言已切换';
                }, item.id),
                col_type: 'text_center_1'
            });
        }
        setResult(result);
    }

    function renderDiagnostics() {
        var logs = core().listValue('diagnostics', []);
        var result = [{ title: '诊断日志', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } }];
        if (!logs.length) result.push({ title: '暂无日志', col_type: 'text_center_1' });
        for (var i = 0; i < logs.length; i++) result.push({ title: logs[i].event || 'request', desc: JSON.stringify(logs[i]), col_type: 'text_1' });
        setResult(result);
    }

    var exported = {
        routeList: routeList,
        routeDetail: routeDetail,
        renderHome: renderHome,
        renderList: renderList,
        renderDetail: renderDetail,
        renderTaxonomy: renderTaxonomy,
        renderModels: renderModels,
        renderFavorites: renderFavorites,
        renderHistory: renderHistory,
        renderSettings: renderSettings,
        renderLanguages: renderLanguages,
        renderDiagnostics: renderDiagnostics
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();

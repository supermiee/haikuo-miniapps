/* MissAV 完整版页面层。优先使用订阅模块，本地文件可作为离线后备。 */
(function () {
    var MODULE_VERSION = '2';
    var PUBLISH_BASE = 'https://supermiee.github.io/haikuo-miniapps/';
    var CORE_PATH = 'hiker://files/rules/missav/missav_core.js';
    var PAGES_PATH = 'hiker://files/rules/missav/missav_pages.js';
    function remote(url, fallback) { try { return requirejs(url); } catch (ignore) { return $.require(fallback); } }
    function core() { return remote(PUBLISH_BASE + 'missav_core.js?v=' + MODULE_VERSION, CORE_PATH); }
    function pages() { return remote(PUBLISH_BASE + 'missav_pages.js?v=' + MODULE_VERSION, PAGES_PATH); }
    function emptyRule(method, params, source) {
        return $('hiker://empty' + (source ? '#' + source : '')).rule(function (payload) {
            try { requirejs('https://supermiee.github.io/haikuo-miniapps/missav_pages.js?v=2')[payload.method](payload.params); }
            catch (ignore) { $.require('hiker://files/rules/missav/missav_pages.js')[payload.method](payload.params); }
        }, { method: method, params: params || {} });
    }
    function addQuery(url, values) {
        var pair = String(url || '').split('?'), path = pair.shift(), query = pair.join('?').split('&'), map = {}, output = [];
        for (var i = 0; i < query.length; i++) if (query[i]) { var p = query[i].split('='); map[decodeURIComponent(p[0])] = decodeURIComponent(p.slice(1).join('=')); }
        for (var key in values) if (values.hasOwnProperty(key)) { if (values[key]) map[key] = values[key]; else delete map[key]; }
        for (var name in map) if (map.hasOwnProperty(name)) output.push(encodeURIComponent(name) + '=' + encodeURIComponent(map[name]));
        return path + (output.length ? '?' + output.join('&') : '');
    }
    function pagedSource(url) { return addQuery(url, { page: 'fypage' }) + '[firstPage=' + url + ']'; }
    function routeList(url, title, options) { return emptyRule('renderList', { url: url, title: title || '影片列表', options: options || {} }, pagedSource(url)); }
    function routeDetail(item) { return emptyRule('renderDetail', item); }
    function routeGenres(url, title) { return emptyRule('renderGenres', { url: url || core().config.source + '/cn/genres', title: title || '类型目录' }, pagedSource(url || core().config.source + '/cn/genres')); }
    function searchUrl(keyword, options) { return addQuery(core().config.source + '/cn/search/' + encodeURIComponent(String(keyword || '').trim()), options || {}); }
    function routeSearch(keyword, options) { return routeList(searchUrl(keyword, options), '搜索：' + keyword, { search: true, keyword: keyword, filter: options && options.filters || '', sort: options && options.sort || '' }); }
    function failure(error, url) {
        return [
            { title: error && error.message || '页面加载失败', desc: '可重试；若站点要求验证，请先打开原网页完成验证。', col_type: 'text_center_1' },
            { title: '重试', url: emptyRule('renderList', { url: url, title: '重试', options: {} }), col_type: 'text_center_1' },
            { title: '打开原网页并人工验证', url: 'web://' + url, col_type: 'text_center_1' }
        ];
    }
    function card(item) {
        return { title: item.title, img: item.image || '', desc: [item.duration, item.badge].filter(function (v) { return v; }).join(' · '), url: routeDetail(item), col_type: 'movie_2' };
    }
    function section(title, items, moreUrl) {
        var result = [{ title: title, col_type: 'text_1', extra: { lineVisible: false } }];
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (moreUrl) result.push({ title: '查看全部', url: moreUrl, col_type: 'text_center_1' });
        return result;
    }
    function scroll(title, url, selected) { return { title: (selected ? '✓ ' : '') + title, url: url, col_type: 'scroll_button' }; }
    function renderHome() {
        var c = core(), source = c.config.source, modules = [
            { title: '最近更新', url: source + '/dm539/cn/new' }, { title: '新片发布', url: source + '/dm634/cn/release' }, { title: '本周热门', url: source + '/dm170/cn/weekly-hot' }
        ], result = [];
        result.push({ title: '搜索 MissAV', desc: '输入番号、标题或女优', url: $('hiker://empty').input(function () { var value = String(input || '').trim(); if (value) return requirejs('https://supermiee.github.io/haikuo-miniapps/missav_pages.js?v=2').routeSearch(value, {}); return 'toast://请输入关键词'; }), col_type: 'input' });
        result.push(scroll('类型目录', routeGenres(), false));
        result.push(scroll('女优目录', 'web://' + source + '/cn/actresses', false));
        result.push(scroll('收藏', emptyRule('renderSaved', {}), false));
        result.push(scroll('历史', emptyRule('renderHistory', {}), false));
        for (var i = 0; i < modules.length; i++) {
            var page = c.fetchCached(modules[i].url, { marker: 'thumbnail' }, 180), items = page.ok ? c.parseCards(page.html, page.url, c.config.limits.home) : [];
            result = result.concat(section(modules[i].title, items, routeList(modules[i].url, modules[i].title)));
        }
        setHomeResult(result);
    }
    function renderList(params) {
        params = params || {}; var c = core(), url = String(params.url || ''), page = c.fetchCached(url, { marker: 'thumbnail' }, 180);
        if (!page.ok) return setResult(failure(page.error, url));
        var options = params.options || {}, result = [], filters = [
            ['全部', ''], ['单人作品', 'individual'], ['日本AV', 'jav'], ['亚洲 AV', 'asiaav'], ['无码流出', 'uncensored-leak'], ['无码影片', 'uncensored'], ['中文字幕', 'chinese-subtitle']
        ], sorts = [['发行日期', 'released_at'], ['最近更新', 'published_at'], ['收藏数', 'saved'], ['今日浏览', 'today_views'], ['本週浏览', 'weekly_views'], ['本月浏览', 'monthly_views'], ['总浏览数', 'views']];
        if (options.search) {
            result.push({ title: '搜索结果：' + (options.keyword || ''), desc: c.parseCount(page.html) ? c.parseCount(page.html) + ' 条影片' : '', col_type: 'text_1' });
            for (var i = 0; i < filters.length; i++) result.push(scroll(filters[i][0], routeSearch(options.keyword, { filters: filters[i][1], sort: options.sort || '' }), (options.filter || '') === filters[i][1]));
            for (var j = 0; j < sorts.length; j++) result.push(scroll(sorts[j][0], routeSearch(options.keyword, { filters: options.filter || '', sort: sorts[j][1] }), (options.sort || '') === sorts[j][1]));
        } else result.push({ title: params.title || '影片列表', col_type: 'text_1' });
        var cards = c.parseCards(page.html, page.url);
        for (var k = 0; k < cards.length; k++) result.push(card(cards[k]));
        if (!cards.length) result.push({ title: '没有解析到影片；可打开原网页检查是否需要验证。', url: 'web://' + url, col_type: 'text_center_1' });
        setResult(result);
    }
    function renderGenres(params) {
        params = params || {}; var c = core(), url = params.url || c.config.source + '/cn/genres', page = c.fetchCached(url, { marker: 'genres' }, 600);
        if (!page.ok) return setResult(failure(page.error, url));
        var result = [{ title: params.title || '类型目录', col_type: 'text_1' }], genres = c.parseGenres(page.html, page.url);
        for (var i = 0; i < genres.length; i++) result.push({ title: genres[i].title, desc: genres[i].count || '', url: routeList(genres[i].url, genres[i].title), col_type: 'text_2' });
        setResult(result);
    }
    function linkButtons(result, title, links) {
        if (!links || !links.length) return;
        result.push({ title: title, col_type: 'text_1' });
        for (var i = 0; i < links.length; i++) result.push(scroll(links[i].title, routeList(links[i].url, links[i].title), false));
    }
    function renderDetail(item) {
        item = item || {}; var c = core(), page = c.fetchCached(item.url, { marker: 'og:title' }, 300);
        if (!page.ok) return setResult(failure(page.error, item.url));
        var detail = c.parseDetail(page.html, page.url), result = [], facts = [];
        c.addHistory(detail);
        if (detail.releaseDate) facts.push('发行：' + detail.releaseDate); if (detail.duration) facts.push('时长：' + detail.duration); if (detail.code) facts.push('番号：' + detail.code);
        result.push({ title: detail.title || item.title || '详情', img: detail.image || item.image || '', desc: facts.join('\n'), col_type: 'movie_1_vertical_pic_blur' });
        if (detail.originalTitle && detail.originalTitle !== detail.title) result.push({ title: detail.originalTitle, col_type: 'text_1' });
        result.push({ title: detail.directUrls.length ? '播放' : '在网页中播放（如有验证请人工完成）', url: detail.directUrls.length ? detail.directUrls[0] : 'web://' + detail.url, col_type: 'text_center_1', extra: detail.directUrls.length ? { referer: c.config.source + '/', ua: c.config.userAgent } : {} });
        result.push({ title: c.isFavorite(detail.url) ? '取消收藏' : '收藏', url: emptyRule('toggleSaved', detail), col_type: 'text_center_1' });
        linkButtons(result, '女优', detail.actors); linkButtons(result, '类型', detail.genres); linkButtons(result, '系列', detail.series); linkButtons(result, '发行商', detail.makers); linkButtons(result, '导演', detail.directors); linkButtons(result, '标籤', detail.labels);
        if (detail.recommendations.length) result = result.concat(section('猜你喜欢', detail.recommendations));
        setResult(result);
    }
    function toggleSaved(item) { core().toggleFavorite(item); refreshPage(false); }
    function renderSaved() { var items = core().readList('favorites'), result = [{ title: '我的收藏', col_type: 'text_1' }]; for (var i = 0; i < items.length; i++) result.push(card(items[i])); if (!items.length) result.push({ title: '暂无收藏', col_type: 'text_center_1' }); setResult(result); }
    function renderHistory() { var items = core().readList('history'), result = [{ title: '观看历史', col_type: 'text_1' }]; for (var i = 0; i < items.length; i++) result.push(card(items[i])); if (!items.length) result.push({ title: '暂无历史', col_type: 'text_center_1' }); setResult(result); }
    var exported = { renderHome: renderHome, renderList: renderList, renderGenres: renderGenres, renderDetail: renderDetail, renderSaved: renderSaved, renderHistory: renderHistory, toggleSaved: toggleSaved, routeSearch: routeSearch };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();

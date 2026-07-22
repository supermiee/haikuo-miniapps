/* Hanime1 页面层。JSON 入口只加载本模块。 */
(function () {
    var MODULE_VERSION = '1';
    var PUBLISH_BASE = 'https://supermiee.github.io/haikuo-miniapps/';
    var CORE_PATH = 'hiker://files/rules/hanime1/hanime_core.js';
    var PAGES_PATH = 'hiker://files/rules/hanime1/hanime_pages.js';
    function remote(url, fallback) { try { return $.require(url); } catch (ignore) { return $.require(fallback); } }
    function core() { return remote(PUBLISH_BASE + 'hanime_core.js?v=' + MODULE_VERSION, CORE_PATH); }
    function addQuery(url, values) {
        var split = String(url || '').split('?'), path = split.shift(), source = split.join('?').split('&'), map = {}, output = [];
        for (var i = 0; i < source.length; i++) if (source[i]) { var pair = source[i].split('='); map[decodeURIComponent(pair[0])] = decodeURIComponent(pair.slice(1).join('=')); }
        for (var key in values) if (values.hasOwnProperty(key)) { if (values[key] !== '' && values[key] !== null && typeof values[key] !== 'undefined') map[key] = values[key]; else delete map[key]; }
        for (var name in map) if (map.hasOwnProperty(name)) output.push(encodeURIComponent(name) + '=' + encodeURIComponent(map[name]));
        return path + (output.length ? '?' + output.join('&') : '');
    }
    function pageUrl(url, page) { return Number(page || 1) > 1 ? addQuery(url, { page: String(page) }) : addQuery(url, { page: '' }); }
    function pagedSource(url) { return addQuery(url, { page: 'fypage' }) + '[firstPage=' + url + ']'; }
    function emptyRule(method, params, source) {
        return $('hiker://empty' + (source ? '#' + source : '')).rule(function (payload) {
            var pages = $.require('https://supermiee.github.io/haikuo-miniapps/hanime_pages.js?v=1');
            if (payload.method === 'renderList') payload.params.page = Number(MY_PAGE || 1);
            pages[payload.method](payload.params);
        }, { method: method, params: params || {} });
    }
    function routeList(url, title) { return emptyRule('renderList', { url: url, title: title || '影片列表' }, pagedSource(url)); }
    function routeDetail(item) { return emptyRule('renderDetail', item); }
    function routeSearch(keyword, sort) { return routeList(addQuery(core().config.sources[0] + '/search', { query: keyword, sort: sort || '最新上市' }), '搜索：' + keyword); }
    function card(item) { return { title: item.title, pic_url: item.image || '', desc: item.remark || '点击查看详情', url: routeDetail(item), col_type: 'movie_2' }; }
    function failure(error, url) {
        return [{ title: error && error.message || '页面加载失败', desc: '该站点可能要求网页验证，海阔无法自动绕过。', col_type: 'text_center_1' }, { title: '在网页打开', url: 'web://' + url, col_type: 'text_center_1' }];
    }
    function section(result, title, items, more) {
        if (!items.length) return;
        result.push({ title: title, col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (more) result.push({ title: '查看全部', url: more, col_type: 'text_center_1' });
    }
    function renderHome() {
        var c = core(), url = c.config.sources[0] + '/', page = c.fetchCached(url, { marker: '/watch' }, 180);
        if (!page.ok) { setHomeResult(failure(page.error, url)); return; }
        var result = [{ title: '搜索 Hanime1', desc: '输入标题或作者', url: "input ? (function(){return $.require('https://supermiee.github.io/haikuo-miniapps/hanime_pages.js?v=1').routeSearch(input,'最新上市');})() : 'toast://请输入关键词'", col_type: 'input', extra: { defaultValue: '' } }];
        var nav = c.parseNav(page.html, page.url);
        for (var n = 0; n < nav.length; n++) result.push({ title: nav[n].title, url: routeList(nav[n].url, nav[n].title), col_type: 'scroll_button' });
        result.push({ title: '收藏', url: emptyRule('renderFavorites', {}), col_type: 'scroll_button' });
        result.push({ title: '历史', url: emptyRule('renderHistory', {}), col_type: 'scroll_button' });
        var items = c.parseCards(page.html, page.url, c.config.limits.home);
        section(result, '首页推荐', items, routeList(url, '首页推荐'));
        if (!items.length) result.push({ title: '首页已加载，但未解析到影片卡片', url: 'web://' + page.url, col_type: 'text_center_1' });
        setHomeResult(result);
    }
    function renderList(params) {
        params = params || {}; var c = core(), requested = pageUrl(params.url, params.page || 1), page = c.fetchCached(requested, { marker: '/watch' }, 180);
        if (!page.ok) { setResult(failure(page.error, requested)); return; }
        try { setPageTitle(params.title || '影片列表'); } catch (ignore) {}
        var result = [], items = c.parseCards(page.html, page.url);
        if (Number(params.page || 1) === 1) result.push({ title: params.title || '影片列表', col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '未解析到影片；页面结构可能已变化或要求验证。', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }
    function renderDetail(item) {
        item = item || {}; var c = core(), page = c.fetchCached(item.url, { marker: '/watch' }, 300);
        if (!page.ok) { setResult(failure(page.error, item.url)); return; }
        var detail = c.parseDetail(page); c.addHistory({ url: detail.url, title: detail.title || item.title, image: detail.image || item.image });
        try { setPageTitle(detail.title || item.title || '视频详情'); } catch (ignore) {}
        try { if (detail.image) setPagePicUrl(detail.image); } catch (ignoreImage) {}
        var result = [];
        if (detail.image) result.push({ pic_url: detail.image, col_type: 'pic_1_full', extra: { lineVisible: false } });
        result.push({ title: detail.title || item.title || '视频详情', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } });
        var facts = []; if (detail.publishedAt) facts.push('发布：' + detail.publishedAt); if (detail.views) facts.push('观看：' + detail.views);
        if (facts.length) result.push({ title: facts.join(' · '), col_type: 'text_1', extra: { lineVisible: false } });
        if (detail.description) result.push({ title: detail.description, col_type: 'rich_text', extra: { textSize: 14, lineVisible: false } });
        if (detail.streams.length) {
            var urls = [], names = [], headers = [];
            for (var i = 0; i < detail.streams.length; i++) { urls.push(detail.streams[i].url); names.push(detail.streams[i].name); headers.push(c.playerHeaders(page)); }
            result.push({ title: '▶ 播放', url: JSON.stringify({ urls: urls, names: names, headers: headers }), col_type: 'text_center_1', extra: { lineVisible: false } });
        } else result.push({ title: '在网页播放', desc: detail.iframe ? '播放器需要在网页运行时解析。' : '未发现公开媒体地址。', url: 'web://' + detail.url, col_type: 'text_center_1' });
        result.push({ title: '收藏 / 取消收藏', url: emptyRule('toggleFavorite', { url: detail.url, title: detail.title || item.title, image: detail.image || item.image }), col_type: 'flex_button' });
        result.push({ title: '打开原网页', url: 'web://' + detail.url, col_type: 'flex_button' });
        if (detail.tags.length) {
            result.push({ title: '标签', col_type: 'long_text', extra: { lineVisible: false } });
            for (var t = 0; t < detail.tags.length; t++) result.push({ title: detail.tags[t].title, url: routeList(detail.tags[t].url, detail.tags[t].title), col_type: 'flex_button' });
        }
        if (detail.playlist.length > 1) section(result, '播放清单', detail.playlist);
        setResult(result);
    }
    function toggleFavorite(item) { var added = core().toggleFavorite(item); refreshPage(false); return 'toast://' + (added ? '已收藏' : '已取消收藏'); }
    function renderFavorites() { renderLocal('favorites', '我的收藏'); }
    function renderHistory() { renderLocal('history', '观看历史'); }
    function renderLocal(key, title) {
        var items = core().readList(key), result = [{ title: title, col_type: 'long_text', extra: { textSize: 18, lineVisible: false } }];
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '暂无内容', col_type: 'text_center_1' }); setResult(result);
    }
    var exported = { routeSearch: routeSearch, renderHome: renderHome, renderList: renderList, renderDetail: renderDetail, toggleFavorite: toggleFavorite, renderFavorites: renderFavorites, renderHistory: renderHistory };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();

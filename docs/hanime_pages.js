/* Hanime1 页面层。JSON 入口只加载本模块。 */
(function () {
    var MODULE_VERSION = '3';
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
            var pages = $.require('https://supermiee.github.io/haikuo-miniapps/hanime_pages.js?v=3');
            if (payload.method === 'renderList') payload.params.page = Number(MY_PAGE || 1);
            pages[payload.method](payload.params);
        }, { method: method, params: params || {} });
    }
    function routeList(url, title) { return emptyRule('renderList', { url: url, title: title || '影片列表' }, pagedSource(url)); }
    function routeDetail(item) { return emptyRule('renderDetail', item); }
    function routeVerification() { return emptyRule('renderVerification', {}); }
    function routeSearch(keyword, sort) { return routeList(addQuery(core().config.sources[0] + '/search', { query: keyword, sort: sort || '最新上市' }), '搜索：' + keyword); }
    function card(item) { return { title: item.title, pic_url: item.image || '', desc: item.remark || '点击查看详情', url: routeDetail(item), col_type: 'movie_2' }; }
    function failure(error, url) {
        return [{ title: error && error.message || '页面加载失败', desc: '请使用“验证并同步”完成站点验证，再返回刷新。', col_type: 'text_center_1' }, { title: '验证并同步', url: routeVerification(), col_type: 'text_center_1' }, { title: '在网页打开', url: 'web://' + url, col_type: 'text_center_1' }];
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
        var result = [{ title: '搜索 Hanime1', desc: '输入标题或作者', url: "input ? (function(){return $.require('https://supermiee.github.io/haikuo-miniapps/hanime_pages.js?v=3').routeSearch(input,'最新上市');})() : 'toast://请输入关键词'", col_type: 'input', extra: { defaultValue: '' } }];
        result.push({ title: '验证并同步', desc: c.verifiedCookie() ? '已检测到本次运行的验证状态；需要时可重新验证。' : '首次使用或显示不可用时，请先在此完成网页验证。', url: routeVerification(), col_type: 'scroll_button' });
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
        item = item || {}; var c = core(), page = c.fetchCached(item.url, { marker: 'og:title' }, 300);
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
    function verificationScript() {
        return $.toString(function () {
            (function () {
                function syncCookie() {
                    try {
                        var cookie = fy_bridge_app.getCookie('');
                        if (cookie && cookie.indexOf('cf_clearance=') >= 0) {
                            fy_bridge_app.putVar('hanime1.webCookie', cookie);
                            fy_bridge_app.setWebTitle('验证完成，可返回刷新小程序');
                        }
                    } catch (ignore) {}
                }
                syncCookie();
                setInterval(syncCookie, 1000);
            })();
        });
    }
    function renderVerification() {
        var c = core(), source = c.config.sources[0] + '/';
        try { setPageTitle('验证并同步'); } catch (ignore) {}
        setResult([
            { title: '验证并同步', desc: '请在下方网页完成 Cloudflare 验证。检测到 cf_clearance 后会仅在本次海阔运行中同步给小程序请求；退出海阔后自动失效。', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } },
            { title: 'Hanime1 网页验证', url: source, desc: 'float&&screen-150', col_type: 'x5_webview_single', extra: { ua: c.config.userAgent, referer: source, canBack: true, js: verificationScript() } },
            { title: '验证完成后返回并刷新', url: $('hiker://empty').lazyRule(function () { back(true); return 'toast://已返回主页，请刷新'; }), col_type: 'text_center_1' }
        ]);
    }
    function toggleFavorite(item) { var added = core().toggleFavorite(item); refreshPage(false); return 'toast://' + (added ? '已收藏' : '已取消收藏'); }
    function renderFavorites() { renderLocal('favorites', '我的收藏'); }
    function renderHistory() { renderLocal('history', '观看历史'); }
    function renderLocal(key, title) {
        var items = core().readList(key), result = [{ title: title, col_type: 'long_text', extra: { textSize: 18, lineVisible: false } }];
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '暂无内容', col_type: 'text_center_1' }); setResult(result);
    }
    var exported = { routeSearch: routeSearch, renderHome: renderHome, renderList: renderList, renderDetail: renderDetail, renderVerification: renderVerification, toggleFavorite: toggleFavorite, renderFavorites: renderFavorites, renderHistory: renderHistory };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();

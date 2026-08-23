/* Hanime1 页面层。JSON 入口只加载本模块。菜单与筛选结构与源站繁體中文界面保持一致。 */
(function () {
    var MODULE_VERSION = '7';
    var PUBLISH_BASE = 'https://supermiee.github.io/haikuo-miniapps/';
    var CORE_PATH = 'hiker://files/rules/hanime1/hanime_core.js';
    var PAGES_PATH = 'hiker://files/rules/hanime1/hanime_pages.js';
    function remote(url, fallback) { try { return $.require(url); } catch (ignore) { return $.require(fallback); } }
    function core() { return remote(PUBLISH_BASE + 'apps/hanime/hanime_core.js?v=' + MODULE_VERSION, CORE_PATH); }
    function decodeSafe(value) { try { return decodeURIComponent(value); } catch (ignore) { return value; } }
    /* values 支持数组（如 tags[] 多选），重复输出同名参数；空串/null 删除该键 */
    function addQuery(url, values) {
        var split = String(url || '').split('?'), path = split.shift(), source = split.join('?').split('&'), map = {}, output = [];
        for (var i = 0; i < source.length; i++) if (source[i]) {
            var pair = source[i].split('=');
            /* Hiker 原生搜索会把未编码的关键词塞进 MY_URL，% 等字符会让 decodeURIComponent 直接抛 URIError */
            var key = decodeSafe(pair[0]), value = pair.length > 1 ? decodeSafe(pair.slice(1).join('=')) : '';
            if (map[key] === undefined) map[key] = value;
            else if (map[key].push) map[key].push(value);
            else map[key] = [map[key], value];
        }
        for (var name in values) if (values.hasOwnProperty(name)) {
            var v = values[name];
            var blank = v === '' || v === null || typeof v === 'undefined' || (!!v.push && !v.length);
            if (blank) delete map[name]; else map[name] = v;
        }
        for (var key2 in map) if (map.hasOwnProperty(key2)) {
            var val = map[key2];
            if (val && val.push) { for (var j = 0; j < val.length; j++) output.push(encodeURIComponent(key2) + '=' + encodeURIComponent(val[j])); }
            else output.push(encodeURIComponent(key2) + '=' + encodeURIComponent(val));
        }
        return path + (output.length ? '?' + output.join('&') : '');
    }
    /* 解析 /search URL 上的筛选状态，供筛选菜单回显与重建 */
    function facetsOf(url) {
        var query = String(url || '').split('?')[1] || '', pairs = query.split('&'), facets = { tags: [] };
        for (var i = 0; i < pairs.length; i++) if (pairs[i]) {
            var pair = pairs[i].split('='), key = decodeSafe(pair[0]), value = pair.length > 1 ? decodeSafe(pair.slice(1).join('=')) : '';
            if (/^tags(?:\[\]|%5B%5D)$/i.test(key)) { if (value) facets.tags.push(value); }
            else facets[key] = value;
        }
        return facets;
    }
    function searchUrl(facets) {
        var c = core(), values = {};
        ['query', 'genre', 'sort', 'year', 'month'].forEach(function (key) { if (facets[key]) values[key] = facets[key]; });
        if (facets.tags && facets.tags.length) values['tags[]'] = facets.tags;
        return addQuery(c.config.sources[0] + '/search', values);
    }
    function pageUrl(url, page) { return Number(page || 1) > 1 ? addQuery(url, { page: String(page) }) : addQuery(url, { page: '' }); }
    function pagedSource(url) { return addQuery(url, { page: 'fypage' }) + '[firstPage=' + url + ']'; }
    function emptyRule(method, params, source) {
        return $('hiker://empty' + (source ? '#' + source : '')).rule(function (payload) {
            var pages;
            try { pages = $.require('https://supermiee.github.io/haikuo-miniapps/apps/hanime/hanime_pages.js?v=7'); } catch (ignore) {}
            if (!pages || typeof pages[payload.method] !== 'function') {
                setResult([{ title: 'Hanime1 模块加载失败', desc: '请检查网络后重试；若持续失败，请重新订阅更新。method=' + payload.method, col_type: 'text_center_1' }]);
                return;
            }
            if (payload.method === 'renderList') payload.params.page = Number(MY_PAGE || 1);
            pages[payload.method](payload.params);
        }, { method: method, params: params || {} });
    }
    function routeList(url, title) { return emptyRule('renderList', { url: url, title: title }, pagedSource(url)); }
    function routeDetail(item) { return emptyRule('renderDetail', item); }
    function routeVerification() { return emptyRule('renderVerification', {}); }
    function routeSearch(keyword, facets) {
        var merged = facets || {}; merged.query = keyword;
        return routeList(searchUrl(merged), '搜索：' + keyword);
    }
    function card(item) { return { title: item.title, pic_url: item.image || '', desc: item.remark || '点击查看详情', url: routeDetail(item), col_type: 'movie_2' }; }
    /* 仅在请求确实被拦截时才引导验证；正常浏览不出现该入口 */
    function failure(error, url, retryParams) {
        return [{ title: error && error.message || '页面加载失败', desc: '站点要求网页验证时，请使用“验证并同步”完成后再刷新。', col_type: 'text_center_1' }, { title: '重试', url: emptyRule(retryParams && retryParams.method || 'renderList', retryParams && retryParams.params || { url: url, title: '重试' }), col_type: 'text_center_1' }, { title: '验证并同步', url: routeVerification(), col_type: 'text_center_1' }, { title: '在网页打开', url: 'web://' + url, col_type: 'text_center_1' }];
    }
    function section(result, title, items, more) {
        if (!items.length) return;
        result.push({ title: title, col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (more) result.push({ title: '查看全部', url: more, col_type: 'text_center_1' });
    }
    /* 筛选菜单：选项全部取自源站当前页面结构（排序面板/类型下拉/年份月份下拉/tags[] 复选框） */
    function filterRows(result, c, html, url) {
        if (String(url).indexOf('/search') < 0) return;
        var facets = facetsOf(url);
        function chipUrl(field, optionValue) {
            var next = {};
            for (var k in facets) if (facets.hasOwnProperty(k)) next[k] = facets[k];
            next[field] = optionValue;
            return searchUrl(next);
        }
        function row(label, options, field, multi) {
            if (!options || !options.length) return;
            result.push({ title: label, col_type: 'long_text', extra: { textSize: 14, lineVisible: false } });
            for (var i = 0; i < options.length; i++) {
                var opt = options[i], value = typeof opt === 'string' ? opt : opt.value, display = typeof opt === 'string' ? opt : (opt.title || opt.value);
                var selected = multi ? facets.tags.indexOf(value) >= 0 : String(facets[field] || '') === String(value);
                if (multi) {
                    var tags = facets.tags.slice(0), at = tags.indexOf(value);
                    if (at >= 0) tags.splice(at, 1); else tags.push(value);
                    var nextFacets = {}; for (var k2 in facets) if (facets.hasOwnProperty(k2)) nextFacets[k2] = facets[k2];
                    nextFacets.tags = tags;
                    result.push({ title: (selected ? '✓ ' : '') + display, url: routeList(searchUrl(nextFacets), paramsTitle(facets)), col_type: 'scroll_button' });
                } else {
                    result.push({ title: (selected ? '✓ ' : '') + display, url: routeList(chipUrl(field, selected ? '' : value), paramsTitle(facets)), col_type: 'scroll_button' });
                }
            }
        }
        row('排序', c.parseSorts(html), 'sort');
        row('類型', c.parseGenres(html), 'genre');
        row('年份', c.parseYears(html), 'year');
        row('月份', c.parseMonths(html), 'month');
        row('標籤', c.parseTagOptions(html), 'tags', true);
    }
    function paramsTitle(facets) {
        if (facets.query) return '搜索：' + facets.query;
        if (facets.genre) return facets.genre;
        return '影片列表';
    }
    function renderHome() {
        var c = core(), url = c.config.sources[0] + '/', page = c.fetchCached(url, { marker: '/watch' }, 180);
        if (!page.ok) { setHomeResult(failure(page.error, url, { method: 'renderHome', params: {} })); return; }
        var result = [{ title: '搜索 Hanime1', desc: '输入标题或作者', url: "input ? (function(){return $.require('https://supermiee.github.io/haikuo-miniapps/apps/hanime/hanime_pages.js?v=7').routeSearch(input);})() : 'toast://请输入关键词'", col_type: 'input', extra: { defaultValue: '' } }];
        var nav = c.parseNav(page.html, page.url);
        for (var n = 0; n < nav.length; n++) result.push({ title: nav[n].title, url: routeList(nav[n].url, nav[n].title), col_type: 'scroll_button' });
        result.push({ title: '收藏', url: emptyRule('renderFavorites', {}), col_type: 'scroll_button' });
        result.push({ title: '历史', url: emptyRule('renderHistory', {}), col_type: 'scroll_button' });
        /* 首页板块与源站一致：逐板块解析「查看更多」锚点区间内的卡片 */
        var sections = c.parseSections(page.html, page.url), added = 0;
        for (var s = 0; s < sections.length && s < 6; s++) {
            var before = result.length;
            section(result, sections[s].title, c.parseCards(sections[s].html, page.url, 6), routeList(sections[s].url, sections[s].title));
            if (result.length > before) added++;
        }
        if (!added) {
            section(result, '最新上市', c.parseCards(page.html, page.url, c.config.limits.home), routeList(c.config.sources[0] + '/search?sort=' + encodeURIComponent('最新上市'), '最新上市'));
            if (!added && !c.parseCards(page.html, page.url, 1).length) result.push({ title: '首页已加载，但未解析到影片卡片', url: 'web://' + page.url, col_type: 'text_center_1' });
        }
        setHomeResult(result);
    }
    function renderList(params) {
        params = params || {}; var c = core(), requested = pageUrl(params.url, params.page || 1), page = c.fetchCached(requested, { marker: '/watch' }, 180);
        if (!page.ok) { setResult(failure(page.error, requested, { method: 'renderList', params: params })); return; }
        try { setPageTitle(params.title || '影片列表'); } catch (ignore) {}
        var result = [], items = c.parseCards(page.html, page.url);
        if (Number(params.page || 1) === 1) {
            result.push({ title: params.title || paramsTitle(facetsOf(params.url)), col_type: 'long_text', extra: { textSize: 18, lineVisible: false } });
            filterRows(result, c, page.html, params.url);
        }
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '未解析到影片；页面结构可能已变化或要求验证。', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }
    function renderDetail(item) {
        item = item || {}; var c = core(), page = c.fetchCached(item.url, { marker: 'og:title' }, 300);
        if (!page.ok) { setResult(failure(page.error, item.url, { method: 'renderDetail', params: item })); return; }
        var detail = c.parseDetail(page); c.addHistory({ url: detail.url, title: detail.title || item.title, image: detail.image || item.image });
        try { setPageTitle(detail.title || item.title || '视频详情'); } catch (ignoreTitle) {}
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
                var timer = null, tries = 0;
                function grab() {
                    tries++;
                    try {
                        /* 双路取 cookie：页面上下文 document.cookie + 桥接 CookieManager，取并集 */
                        var raw = String(document.cookie || '');
                        try {
                            var bridged = fy_bridge_app.getCookie(String(location.href || ''));
                            if (bridged && String(bridged).length > raw.length) raw = String(bridged);
                        } catch (ignoreBridge) {}
                        var match = /(?:^|;\s*)(cf_clearance=[^;]+)/.exec(raw);
                        if (match) {
                            /* 成对保存 cookie 与签发时的真实 UA：请求回放时 UA 必须一致 */
                            fy_bridge_app.putVar('hanime1.webSession', JSON.stringify({ cookie: match[1], ua: navigator.userAgent }));
                            fy_bridge_app.setWebTitle('✅ 验证成功，请返回并刷新');
                            if (timer) clearInterval(timer);
                        }
                    } catch (ignore) {}
                    if (tries > 300 && timer) clearInterval(timer);
                }
                grab();
                timer = setInterval(grab, 800);
            })();
        });
    }
    function renderVerification() {
        var c = core(), source = c.config.sources[0] + '/';
        try { setPageTitle('验证并同步'); } catch (ignore) {}
        setResult([
            { title: '验证并同步', desc: '在下方网页完成 Cloudflare 人机验证。检测到 cf_clearance 后会连同验证时的浏览器标识一起保存（退出海阔前有效），后续请求将原样回放，避免再次拦截。', col_type: 'long_text', extra: { textSize: 16, lineVisible: false } },
            { title: source, desc: 'float&&screen-150', col_type: 'x5_webview_single', extra: { ua: c.config.mobileUa, referer: source, canBack: true, js: verificationScript() } },
            { title: '手动导入 cf_clearance（备用）', desc: '若内嵌网页反复验证不通过：①点下方「在浏览器完成验证」；②通过后复制 cookie 中的 cf_clearance 值；③粘贴到本输入框。注意：浏览器与手机指纹不同时可能仍被拦截，优先使用上方网页验证。', col_type: 'long_text', extra: { textSize: 14, lineVisible: false } },
            { title: '粘贴 cf_clearance', url: "$.require('https://supermiee.github.io/haikuo-miniapps/apps/hanime/hanime_pages.js?v=7').importCookie(input)", col_type: 'input', extra: { defaultValue: '' } },
            { title: '在浏览器完成验证', url: 'web://' + source, col_type: 'text_center_1' },
            { title: '验证完成后返回并刷新', url: $('hiker://empty').lazyRule(function () { back(true); return 'toast://已返回，请刷新'; }), col_type: 'text_center_1' }
        ]);
    }
    function importCookie(value) { return core().importCookie(value); }
    function toggleFavorite(item) { var added = core().toggleFavorite(item); refreshPage(false); return 'toast://' + (added ? '已收藏' : '已取消收藏'); }
    function renderFavorites() { renderLocal('favorites', '我的收藏'); }
    function renderHistory() { renderLocal('history', '观看历史'); }
    function renderLocal(key, title) {
        var items = core().readList(key), result = [{ title: title, col_type: 'long_text', extra: { textSize: 18, lineVisible: false } }];
        for (var i = 0; i < items.length; i++) result.push(card(items[i]));
        if (!items.length) result.push({ title: '暂无内容', col_type: 'text_center_1' }); setResult(result);
    }
    var exported = { routeSearch: routeSearch, renderHome: renderHome, renderList: renderList, renderDetail: renderDetail, renderVerification: renderVerification, toggleFavorite: toggleFavorite, renderFavorites: renderFavorites, renderHistory: renderHistory, importCookie: importCookie };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();

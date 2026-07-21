/* MissAV 完整版页面层。优先使用订阅模块，本地文件可作为离线后备。 */
(function () {
    var MODULE_VERSION = '19';
    var PUBLISH_BASE = 'https://supermiee.github.io/haikuo-miniapps/';
    var CORE_PATH = 'hiker://files/rules/missav/missav_core.js';
    var PAGES_PATH = 'hiker://files/rules/missav/missav_pages.js';
    function remote(url, fallback) { try { return requirejs(url); } catch (ignore) { return $.require(fallback); } }
    function core() { return remote(PUBLISH_BASE + 'missav_core.js?v=' + MODULE_VERSION, CORE_PATH); }
    function pages() { return remote(PUBLISH_BASE + 'missav_pages.js?v=' + MODULE_VERSION, PAGES_PATH); }
    function emptyRule(method, params, source) {
        return $('hiker://empty' + (source ? '#' + source : '')).rule(function (payload) {
            /* Empty-rule callbacks do not always expose requirejs. Use the supported module loader directly. */
            var args = payload.params || {};
            if (payload.paged) {
                /* MY_URL contains Hiker's fypage marker on later pages. Build a clean MissAV URL from MY_PAGE instead. */
                var pageNumber = Number(MY_PAGE || 1);
                if (!pageNumber || pageNumber < 1) pageNumber = 1;
                /* Rule callbacks run in an isolated scope: keep URL composition self-contained. */
                var baseUrl = String(args.url || '').replace(/([?&])page=[^&]*/i, '').replace('?&', '?').replace(/&&/g, '&').replace(/[?&]$/, '');
                args.url = pageNumber > 1 ? baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'page=' + pageNumber : baseUrl;
            }
            var module = $.require('https://supermiee.github.io/haikuo-miniapps/missav_pages.js?v=19');
            if (!module || typeof module[payload.method] !== 'function') throw new Error('MissAV 页面模块加载失败：' + payload.method);
            module[payload.method](args);
        }, { method: method, params: params || {}, paged: !!source });
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
    function routePage(method) { return emptyRule(method, {}); }
    function routeGenres(url, title) { return emptyRule('renderGenres', { url: url || core().config.source + '/cn/genres', title: title || '类型目录' }, pagedSource(url || core().config.source + '/cn/genres')); }
    function routeActresses(url, title) { return emptyRule('renderActresses', { url: url || core().config.source + '/cn/actresses', title: title || '女优目录' }, pagedSource(url || core().config.source + '/cn/actresses')); }
    function searchUrl(keyword, options) { return addQuery(core().config.source + '/cn/search/' + encodeURIComponent(String(keyword || '').trim()), options || {}); }
    function routeSearch(keyword, options) {
        /* Search pages use query parameters; do not embed the URL inside Hiker's fypage token. */
        var url = searchUrl(keyword, options);
        return emptyRule('renderList', { url: url, title: '搜索：' + keyword, options: { search: true, keyword: keyword, filter: options && options.filters || '', sort: options && options.sort || '' } }, pagedSource(url));
    }
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
            { title: '最近更新', url: source + '/cn/new' }, { title: '新片发布', url: source + '/cn/release' }, { title: '本周热门', url: source + '/cn/weekly-hot' }
        ], result = [];
        result.push({
            title: '搜索 MissAV',
            desc: '输入番号、标题或女优',
            url: "input ? $.require('https://supermiee.github.io/haikuo-miniapps/missav_pages.js?v=19').routeSearch(input,{}) : 'toast://请输入关键词'",
            col_type: 'input',
            extra: { defaultValue: '' }
        });
        result.push(scroll('类型目录', routeGenres(), false));
        result.push(scroll('女优目录', routeActresses(), false));
        result.push(scroll('播放设置', routePage('renderPlaySettings'), false));
        result.push(scroll('收藏', emptyRule('renderSaved', {}), false));
        result.push(scroll('历史', emptyRule('renderHistory', {}), false));
        var homeUrls = [];
        for (var i = 0; i < modules.length; i++) homeUrls.push(modules[i].url);
        var homePages = c.fetchManyCached(homeUrls, { marker: 'thumbnail', timeout: 5000 }, 300);
        for (var j = 0; j < modules.length; j++) {
            var page = homePages[j], items = page.ok ? c.parseCards(page.html, page.url, c.config.limits.home) : [];
            result = result.concat(section(modules[j].title, items, routeList(modules[j].url, modules[j].title)));
            if (!page.ok) result.push({ title: '加载失败：' + modules[j].title, desc: (page.error && page.error.message || '未知错误') + '\n' + modules[j].url, url: 'web://' + modules[j].url, col_type: 'text_1' });
            else if (!items.length) result.push({ title: '未解析到影片：' + modules[j].title, desc: '页面已获取，但影片卡片结构发生变化。', url: 'web://' + modules[j].url, col_type: 'text_1' });
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
    function renderActresses(params) {
        params = params || {}; var c = core(), url = params.url || c.config.source + '/cn/actresses', page = c.fetchCached(url, { marker: 'actresses' }, 600);
        if (!page.ok) return setResult(failure(page.error, url));
        var result = [{ title: params.title || '女优目录', col_type: 'text_1' }], actresses = c.parseActresses(page.html, page.url);
        for (var i = 0; i < actresses.length; i++) result.push({ title: actresses[i].title, desc: actresses[i].count, url: routeList(actresses[i].url, actresses[i].title), col_type: 'text_2' });
        if (!actresses.length) result.push({ title: '未解析到女优目录', url: 'web://' + page.url, col_type: 'text_center_1' });
        setResult(result);
    }
    function linkButtons(result, title, links) {
        if (!links || !links.length) return;
        result.push({ title: title, col_type: 'text_1' });
        for (var i = 0; i < links.length; i++) result.push(scroll(links[i].title, routeList(links[i].url, links[i].title), false));
    }
    function linkNames(links) {
        var names = [];
        for (var i = 0; links && i < links.length; i++) names.push(links[i].title);
        return names.join('、');
    }
    function renderDetail(item) {
        item = item || {}; var c = core(), page = c.fetchCached(item.url, { marker: 'og:title' }, 300);
        if (!page.ok) return setResult(failure(page.error, item.url));
        var detail = c.parseDetail(page.html, page.url), result = [], facts = [];
        c.addHistory(detail);
        try { setPageTitle(detail.title || item.title || '视频详情'); } catch (ignoreTitle) {}
        try { if (detail.image || item.image) setPagePicUrl(detail.image || item.image); } catch (ignoreImage) {}
        if (detail.releaseDate) facts.push('发行：' + detail.releaseDate); if (detail.duration) facts.push('时长：' + detail.duration); if (detail.code) facts.push('番号：' + detail.code);
        /* MissAV covers are landscape: pic_1_full preserves the entire image instead of cropping it into a movie card. */
        if (detail.image || item.image) result.push({ pic_url: detail.image || item.image, col_type: 'pic_1_full', extra: { lineVisible: false } });
        result.push({ title: detail.title || item.title || '详情', col_type: 'long_text', extra: { textSize: 19, lineVisible: false } });
        if (facts.length) result.push({ title: facts.join('  ·  '), col_type: 'text_1', extra: { lineVisible: false } });
        if (detail.description) result.push({ title: '简介\n' + detail.description, col_type: 'long_text', extra: { textSize: 15, lineVisible: false } });
        var metadata = [];
        if (detail.releaseDate) metadata.push('发行日期：' + detail.releaseDate);
        if (detail.code) metadata.push('番号：' + detail.code);
        if (detail.originalTitle) metadata.push('标题：' + detail.originalTitle);
        if (detail.actors.length) metadata.push('女优：' + linkNames(detail.actors));
        if (detail.maleActors.length) metadata.push('男优：' + linkNames(detail.maleActors));
        if (detail.genres.length) metadata.push('类型：' + linkNames(detail.genres));
        if (detail.series.length) metadata.push('系列：' + linkNames(detail.series));
        if (detail.makers.length) metadata.push('发行商：' + linkNames(detail.makers));
        if (detail.directors.length) metadata.push('导演：' + linkNames(detail.directors));
        if (detail.labels.length) metadata.push('标籤：' + linkNames(detail.labels));
        if (metadata.length) result.push({ title: metadata.join('\n'), col_type: 'long_text', extra: { textSize: 15, lineVisible: false } });
        var stream = c.selectStream(detail, c.getPlayQuality());
        result.push({ title: stream.url ? ('播放' + (stream.quality ? ' · ' + stream.quality : '')) : '在网页中播放', url: stream.url ? JSON.stringify({ urls: [stream.url], names: [stream.quality || '默认线路'], headers: [c.playerHeaders(page)] }) : ('web://' + detail.url), col_type: 'text_center_1', extra: { lineVisible: false } });
        result.push({ title: c.isFavorite(detail.url) ? '取消收藏' : '收藏', url: emptyRule('toggleSaved', detail), col_type: 'text_center_1' });
        linkButtons(result, '女优', detail.actors); linkButtons(result, '男优', detail.maleActors); linkButtons(result, '类型', detail.genres); linkButtons(result, '系列', detail.series); linkButtons(result, '发行商', detail.makers); linkButtons(result, '导演', detail.directors); linkButtons(result, '标籤', detail.labels);
        if (detail.recommendations.length) result = result.concat(section('猜你喜欢', detail.recommendations));
        setResult(result);
    }
    function toggleSaved(item) { core().toggleFavorite(item); refreshPage(false); }
    function renderPlaySettings() {
        var c = core(), selected = c.getPlayQuality(), options = [['highest', '最高可用'], ['1080', '1080p'], ['720', '720p'], ['540', '540p'], ['480', '480p'], ['360', '360p']], result = [{ title: '播放设置', desc: '默认清晰度：' + (selected === 'highest' ? '最高可用' : selected + 'p') + '\n若源站不提供所选画质，将自动选择最接近的可用画质。', col_type: 'long_text', extra: { textSize: 17, lineVisible: false } }];
        try { setPageTitle('播放设置'); } catch (ignore) {}
        for (var i = 0; i < options.length; i++) result.push({ title: (selected === options[i][0] ? '✓ ' : '') + options[i][1], url: emptyRule('setPlaybackQuality', { value: options[i][0] }), col_type: 'text_center_1' });
        setResult(result);
    }
    function setPlaybackQuality(params) { core().setPlayQuality(params && params.value); refreshPage(false); }
    function renderSaved() { var items = core().readList('favorites'), result = [{ title: '我的收藏', col_type: 'text_1' }]; for (var i = 0; i < items.length; i++) result.push(card(items[i])); if (!items.length) result.push({ title: '暂无收藏', col_type: 'text_center_1' }); setResult(result); }
    function renderHistory() { var items = core().readList('history'), result = [{ title: '观看历史', col_type: 'text_1' }]; for (var i = 0; i < items.length; i++) result.push(card(items[i])); if (!items.length) result.push({ title: '暂无历史', col_type: 'text_center_1' }); setResult(result); }
    var exported = { renderHome: renderHome, renderList: renderList, renderGenres: renderGenres, renderActresses: renderActresses, renderDetail: renderDetail, renderPlaySettings: renderPlaySettings, setPlaybackQuality: setPlaybackQuality, renderSaved: renderSaved, renderHistory: renderHistory, toggleSaved: toggleSaved, routeSearch: routeSearch };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();

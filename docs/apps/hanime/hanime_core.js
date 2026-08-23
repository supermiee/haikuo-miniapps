/* Hanime1 公共内核：请求、解析、缓存与播放地址处理。数据一律取自源站繁體中文界面。 */
(function () {
    var CONFIG = {
        version: '9',
        sources: ['https://hanime1.me'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        /* 验证用移动端 UA：X5 内核带桌面指纹过不了 Cloudflare 托管挑战，会无限循环 */
        mobileUa: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        sessionKey: 'hanime1.webSession',
        timeout: 8000,
        webViewTimeout: 12000,
        cachePrefix: 'hanime1.',
        limits: { home: 12, history: 100 }
    };
    /* 与源站导航/排序面板一致的兜底值；页面可解析时以解析结果为准 */
    var FALLBACK_GENRES = ['全部', '裏番', '泡麵番', 'Motion Anime', '3DCG', '2.5D', '2D動畫', 'AI生成', 'MMD', 'Cosplay'];
    var FALLBACK_SORTS = ['本日排行', '最新內容', '最新上傳', '觀看次數'];

    function now() { return new Date().getTime(); }
    function text(value) {
        return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
            .replace(/\s+/g, ' ').trim();
    }
    function absolute(value, baseUrl) {
        var url = String(value || '').replace(/&amp;/gi, '&').trim();
        if (!url || /^javascript:/i.test(url)) return '';
        if (/^https?:\/\//i.test(url)) return url;
        if (/^\/\//.test(url)) return 'https:' + url;
        var host = /^(https?:\/\/[^/]+)/i.exec(String(baseUrl || CONFIG.sources[0]));
        if (!host) return '';
        if (url.charAt(0) === '/') return host[1] + url;
        var path = String(baseUrl || CONFIG.sources[0]).replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');
        return path + url;
    }
    function attr(html, name) {
        var match = new RegExp('\\s' + name + '\\s*=\\s*["\']([^"\']+)["\']', 'i').exec(String(html || ''));
        return match ? match[1] : '';
    }
    function origin(url) { var match = /^(https?:\/\/[^/]+)/i.exec(String(url || '')); return match ? match[1] : CONFIG.sources[0]; }
    function response(raw) {
        if (!raw) return { body: '', headers: {}, statusCode: 0 };
        try { var parsed = JSON.parse(raw); if (parsed && typeof parsed.body !== 'undefined') return parsed; } catch (ignore) {}
        return { body: String(raw), headers: {}, statusCode: 200 };
    }
    function responseCookie(headers) {
        var value = headers && (headers['Set-Cookie'] || headers['set-cookie']);
        if (!value) return '';
        if (Object.prototype.toString.call(value) !== '[object Array]') value = [value];
        var output = [];
        for (var i = 0; i < value.length; i++) {
            var cookie = String(value[i]).split(';')[0];
            if (cookie) output.push(cookie);
        }
        return output.join('; ');
    }
    function verifiedCookie() {
        var session = verifiedSession();
        return session ? session.cookie : '';
    }
    /* 验证会话 = cf_clearance + 签发时的 UA，二者必须成对回放（Cloudflare 按 UA+IP 绑定签发） */
    function verifiedSession() {
        try {
            var raw = String(getVar(CONFIG.sessionKey, '') || '');
            if (!raw) return null;
            if (raw.indexOf('{') < 0) return { cookie: raw, ua: '' };
            var parsed = JSON.parse(raw);
            if (!parsed || !parsed.cookie) return null;
            return { cookie: String(parsed.cookie), ua: String(parsed.ua || '') };
        } catch (ignore) { return null; }
    }
    /* 验证状态变化后，旧的页面缓存（可能包含失败结果或过期数据）全部作废 */
    function clearPageCache() {
        try {
            if (typeof listMyVarKeys === 'undefined' || typeof clearMyVar === 'undefined') return;
            var all = listMyVarKeys() || [];
            for (var i = 0; i < all.length; i++) if (String(all[i]).indexOf(cacheKey('page.')) === 0) clearMyVar(all[i]);
        } catch (ignore) {}
    }
    function saveSession(cookie, ua) {
        var payload = JSON.stringify({ cookie: String(cookie || ''), ua: String(ua || '') });
        try { putVar(CONFIG.sessionKey, payload); } catch (ignore) {}
        clearPageCache();
        return payload;
    }
    /* 手动导入兜底：接受完整 cookie 串或裸 cf_clearance 值 */
    function importCookie(value) {
        var text = String(value || '').trim();
        if (!text) return 'toast://请粘贴包含 cf_clearance 的内容';
        var match = /cf_clearance\s*=\s*([^;\s"']+)/i.exec(text);
        var token = match ? match[1] : (/^[A-Za-z0-9_%\-]+$/.test(text) ? text : '');
        if (!token) return 'toast://未识别到 cf_clearance';
        saveSession('cf_clearance=' + token, CONFIG.mobileUa);
        return 'toast://已导入验证会话，请返回并刷新';
    }
    function usable(html, marker) {
        if (!html || html.length < 300) return false;
        /* 线上拦截页实测为 "Attention Required" WAF 页（403），并不含 "Just a moment"，需一并识别 */
        if (/just a moment|attention required|cf-chl|challenges\.cloudflare\.com|enable javascript and cookies|error code: 10\d\d/i.test(String(html))) return false;
        return !marker || String(html).indexOf(marker) >= 0;
    }
    function replaceHost(url, host) { return String(url || '').replace(/^https?:\/\/[^/]+/i, host); }
    /* 硬拦截特征：命中即说明必须人工验证，WebView 兜底也只会白等 */
    function isHardBlock(html, status) {
        if (Number(status) === 403) return true;
        return /just a moment|attention required|cf-chl|challenges\.cloudflare\.com|error code: 10\d\d/i.test(String(html || ''));
    }
    /* 会话三种形态：
     * 1. cookie+ua 齐全 → fetchPC 原样回放（最快）
     * 2. 仅 cookie（桥接同步而来，UA 未知）→ 走 fetchCodeByWebView：与验证网页共用内核/UA/CookieManager，天然携带凭证
     * 3. 无会话 → fetchPC 直连；硬拦立即给引导 */
    function requestByWebView(url, options) {
        if (typeof fetchCodeByWebView === 'undefined') return null;
        try {
            var html = fetchCodeByWebView(url, {
                headers: { 'User-Agent': CONFIG.mobileUa, Referer: origin(url) + '/' },
                timeout: (options && options.webViewTimeout) || CONFIG.webViewTimeout,
                checkJs: $.toString(function () {
                    return !!document.querySelector('a[href*="/watch?v="], a[href*="/watch/"], meta[property="og:title"]');
                })
            });
            if (usable(html, options && options.marker)) return { ok: true, url: url, html: html, cookie: '', status: 200, via: 'webview' };
        } catch (error) { return { error: String(error) }; }
        return null;
    }
    function request(url, options) {
        options = options || {};
        var failures = [], hardBlocked = false;
        var session = verifiedSession();
        /* UA 未知的会话直接走 WebView：凭证在应用 CookieManager 里，与验证时同源同指纹 */
        if (session && session.cookie && !session.ua && typeof fetchCodeByWebView !== 'undefined') {
            var viaWebview = requestByWebView(url, options);
            if (viaWebview && viaWebview.ok) return viaWebview;
            failures.push({ source: 'webview', status: 0, reason: viaWebview && viaWebview.error ? viaWebview.error : 'webview unusable' });
        }
        for (var i = 0; i < CONFIG.sources.length; i++) {
            var target = replaceHost(url, CONFIG.sources[i]);
            try {
                /* 有验证会话时必须原样回放签发时的 UA，否则 cf_clearance 因 UA 不匹配而失效 */
                var headers = { 'User-Agent': session && session.ua ? session.ua : CONFIG.userAgent, Referer: CONFIG.sources[i] + '/', 'Accept-Language': 'zh-TW,zh-CN;q=0.9,zh;q=0.8' };
                if (session && session.cookie) headers.Cookie = session.cookie;
                var raw = fetchPC(target, { headers: headers, timeout: options.timeout || CONFIG.timeout, withStatusCode: true, withHeaders: true });
                var page = response(raw), html = page.body || '', status = Number(page.statusCode || 0);
                if ((status === 0 || status < 400) && usable(html, options.marker)) {
                    return { ok: true, url: target, html: html, cookie: responseCookie(page.headers), status: status || 200 };
                }
                if (isHardBlock(html, status)) hardBlocked = true;
                failures.push({ source: CONFIG.sources[i], status: status, reason: isHardBlock(html, status) ? 'Cloudflare verification' : 'unexpected page structure' });
            } catch (error) { failures.push({ source: CONFIG.sources[i], status: 0, reason: String(error) }); }
        }
        /* 无会话且硬拦 → 必须人工验证，跳过兜底秒级引导；
         * 已有会话仍硬拦 → 凭证可能只存在于 CookieManager，给 WebView 一次机会再认输 */
        var allowWebviewFallback = !hardBlocked || !!session;
        if (typeof fetchCodeByWebView !== 'undefined' && allowWebviewFallback) {
            var webView = requestByWebView(url, options);
            if (webView && webView.ok) return webView;
            if (webView && webView.error) failures.push({ source: 'webview', status: 0, reason: webView.error });
        } else if (hardBlocked) {
            failures.push({ source: 'webview', status: 0, reason: 'skipped: interactive verification required' });
        }
        return { ok: false, url: url, hardBlocked: hardBlocked, error: { code: 'NETWORK_OR_VERIFICATION', message: hardBlocked ? '站点要求人机验证，请使用「验证并同步」' : '站点不可用或需要在网页完成验证', failures: failures } };
    }
    function cacheKey(key) { return CONFIG.cachePrefix + key; }
    function readCache(key, ttl) {
        try { var item = storage0.getMyVar(cacheKey(key)); return item && now() - item.savedAt < ttl * 1000 ? item.value : null; } catch (ignore) { return null; }
    }
    function fetchCached(url, options, ttl) {
        var key = 'page.' + String(url), cached = readCache(key, ttl || 180);
        if (cached) return cached;
        var page = request(url, options);
        /* 成功长缓存；硬拦失败短缓存（30s），避免被拦期间每次点击都重新烧请求 */
        var storeTtl = page.ok ? (ttl || 180) : (page.hardBlocked ? 30 : 0);
        if (storeTtl) try { storage0.putMyVar(cacheKey(key), { savedAt: now(), value: page }); } catch (ignore) {}
        return page;
    }
    function first(block, selectors) {
        for (var i = 0; i < selectors.length; i++) {
            try { var value = text(pdfh(block, selectors[i])); if (value) return value; } catch (ignore) {}
        }
        return '';
    }
    function image(block, baseUrl) {
        var value = attr(block, 'data-src') || attr(block, 'data-lazy-src') || attr(block, 'data-original') || attr(block, 'src');
        if (!value) { try { value = pdfh(block, 'img&&data-src') || pdfh(block, 'img&&src'); } catch (ignore) {} }
        return absolute(value, baseUrl);
    }
    function watchUrl(block, baseUrl) {
        var match = /href\s*=\s*["\']([^"\']*(?:\/watch\?v=|\/watch\/)[^"\']*)/i.exec(String(block || ''));
        return match ? absolute(match[1], baseUrl) : '';
    }
    function cardMeta(block) {
        var clean = text(block), duration = (/(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)(?:\s|$)/.exec(clean) || [])[1] || '';
        var like = (/(\d{1,3}%)/.exec(clean) || [])[1] || '';
        var views = (/(\d[\d,.]*\s*[萬万]?(?:次觀看|次观看|views?|\d*次))/.exec(clean) || [])[1] || '';
        var date = (/(\d+\s*(?:分鐘|分钟|小時|小时|天|週|周|個月|个月|年前))/.exec(clean) || [])[1] || '';
        return [duration, like, views, date].filter(function (value) { return value; }).join(' · ');
    }
    function parseCards(html, baseUrl, limit) {
        var selectors = ['body&&a[href*="/watch?v="]', 'body&&a[href*="/watch/"]', 'body&&div[class*=video]', 'body&&article'];
        var blocks = [], result = [], seen = {};
        for (var i = 0; i < selectors.length; i++) { try { blocks = pdfa(html, selectors[i]); } catch (ignore) {} if (blocks && blocks.length) break; }
        for (var j = 0; j < blocks.length && (!limit || result.length < limit); j++) {
            var url = watchUrl(blocks[j], baseUrl); if (!url || seen[url]) continue;
            var title = first(blocks[j], ['img&&alt', 'h1&&Text', 'h2&&Text', 'h3&&Text', 'h4&&Text', '[title]&&title', 'a&&Text']);
            if (!title || /^(play|播放|info|更多資訊)$/i.test(title)) title = text(attr(blocks[j], 'title')) || url;
            seen[url] = true;
            result.push({ title: title, url: url, image: image(blocks[j], baseUrl), remark: cardMeta(blocks[j]) });
        }
        return result;
    }
    /* 顶部主导航：类型来自站点的 genre 下拉（genre-option），外加「新番預告」入口 */
    function parseNav(html, baseUrl) {
        var source = String(html || ''), result = [], seen = {};
        collectGenres(source).forEach(function (value) {
            if (value === '全部') return;
            seen[value] = true;
            result.push({ title: value, url: absolute('/search?genre=' + encodeURIComponent(value), baseUrl) });
        });
        if (!result.length) {
            FALLBACK_GENRES.slice(1).forEach(function (value) {
                seen[value] = true;
                result.push({ title: value, url: absolute('/search?genre=' + encodeURIComponent(value), baseUrl) });
            });
        }
        var previewRe = /<a\b[^>]*href\s*=\s*["']([^"']*\/previews\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/ig, m2;
        while ((m2 = previewRe.exec(source))) {
            if (text(m2[2]).indexOf('新番預告') < 0) continue;
            var url = absolute(m2[1], baseUrl);
            if (!seen[url]) { seen[url] = true; result.push({ title: '新番預告', url: url }); }
            break;
        }
        return result;
    }
    /* 站点 genre 下拉：仅取带 data-value 的条目（无 data-value 的是「新番預告/H漫畫」等普通导航） */
    function collectGenres(source) {
        var values = [], re = /<div\b[^>]*class\s*=\s*["'][^"']*genre-option[^"']*["'][^>]*>([^<]*)/ig, m;
        while ((m = re.exec(source))) {
            var value = attr(m[0], 'data-value');
            if (!value || values.indexOf(value) >= 0) continue;
            values.push(value);
        }
        return values;
    }
    /* 类型筛选（含「全部」），与站点 genre 下拉一致 */
    function parseGenres(html) {
        var values = collectGenres(String(html || ''));
        return values.length ? values : FALLBACK_GENRES.slice(0);
    }
    /* 排序选项：取自站点 #sort-wrapper 面板 */
    function parseSorts(html) {
        var source = String(html || '');
        var panel = /<div[^>]*id=["']sort-wrapper["'][^>]*>[\s\S]*?<\/form>/i.exec(source);
        var scope = panel ? panel[0] : source;
        var re = /class\s*=\s*["'][^"']*hentai-sort-options[^"']*["'][^>]*>([^<]+)</ig, options = [], seen = {}, m;
        while ((m = re.exec(scope))) {
            var value = text(m[1]);
            if (!value || seen[value]) continue;
            seen[value] = true; options.push(value);
        }
        return options.length ? options : FALLBACK_SORTS.slice(0);
    }
    function parseSelectOptions(html, name) {
        var select = new RegExp('<select[^>]*name\\s*=\\s*["\']' + name + '["\'][^>]*>[\\s\\S]*?</select>', 'i').exec(String(html || ''));
        if (!select) return [];
        var re = /<option[^>]*value\s*=\s*["']([^"']*)["'][^>]*>([^<]*)</ig, options = [], m;
        while ((m = re.exec(select[0]))) if (m[1] !== '') options.push({ value: m[1], title: text(m[2]) });
        return options;
    }
    function parseYears(html) {
        var parsed = parseSelectOptions(html, 'year');
        if (parsed.length) return parsed;
        var latest = new Date().getFullYear(), options = [];
        for (var y = latest; y >= 2008; y--) options.push({ value: String(y), title: y + '年' });
        return options;
    }
    function parseMonths(html) {
        var parsed = parseSelectOptions(html, 'month');
        if (parsed.length) return parsed;
        var options = [];
        for (var mth = 1; mth <= 12; mth++) options.push({ value: String(mth), title: mth + '月' });
        return options;
    }
    /* 標籤多选：与站点 tags[] 复选框一致 */
    function parseTagOptions(html) {
        var source = String(html || ''), values = [], seen = {};
        var re = /<input[^>]*name\s*=\s*["']tags(?:\[\]|%5B%5D)["'][^>]*>/ig, m;
        while ((m = re.exec(source))) {
            var value = attr(m[0], 'value');
            if (!value || seen[value]) continue;
            seen[value] = true; values.push(value);
        }
        return values;
    }
    /* 首页横向板块：解析每个「查看更多」标题锚点及其卡片区间，保持与源站首页一致 */
    function parseSections(html, baseUrl) {
        var source = String(html || ''), anchors = [], re = /<a\b[^>]*href\s*=\s*["']([^"']*\/search\?[^"']*(?:sort|genre)=[^"']*)["'][^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/ig, m;
        while ((m = re.exec(source))) {
            var title = text(m[2]).replace(/查看更多|arrow_\w+|查看|更多/g, '').trim();
            if (!title) continue;
            anchors.push({ title: title, url: absolute(m[1], baseUrl), index: m.index, length: m[0].length });
        }
        var sections = [], seen = {};
        for (var i = 0; i < anchors.length; i++) {
            var key = anchors[i].title;
            if (seen[key]) continue;
            seen[key] = true;
            var start = anchors[i].index + anchors[i].length;
            var end = i + 1 < anchors.length ? anchors[i + 1].index : Math.min(source.length, start + 60000);
            sections.push({ title: anchors[i].title, url: anchors[i].url, html: source.slice(start, end) });
        }
        return sections;
    }
    function meta(html, name) {
        var tags = String(html || '').match(/<meta\b[^>]*>/ig) || [];
        for (var i = 0; i < tags.length; i++) if (String(attr(tags[i], 'property') || attr(tags[i], 'name')).toLowerCase() === String(name).toLowerCase()) return text(attr(tags[i], 'content'));
        return '';
    }
    function links(html, pattern, baseUrl) {
        var anchors = String(html || '').match(/<a\b[^>]*href\s*=\s*["\'][^"\']+["\'][^>]*>[\s\S]*?<\/a>/ig) || [], result = [], seen = {};
        for (var i = 0; i < anchors.length; i++) {
            var url = absolute(attr(anchors[i], 'href'), baseUrl), title = text(anchors[i]);
            if (url && title && pattern.test(url) && !seen[url]) { seen[url] = true; result.push({ title: title, url: url }); }
        }
        return result;
    }
    function unescapeUrl(value) { return String(value || '').replace(/\\u002f/gi, '/').replace(/\\u0026/gi, '&').replace(/\\\//g, '/').replace(/&amp;/gi, '&').replace(/["'\\]+$/, ''); }
    function parseStreams(html) {
        var source = String(html || ''), matcher = /(?:https?:)?\\?\/\\?\/[^\s"'<>]+?\.(?:m3u8|mp4)(?:[^\s"'<>]*)/ig, result = [], seen = {}, match;
        while ((match = matcher.exec(source))) {
            var url = unescapeUrl(match[0]); if (/^\/\//.test(url)) url = 'https:' + url;
            if (!/^https?:\/\//i.test(url) || seen[url]) continue;
            seen[url] = true;
            var quality = (/(2160|1440|1080|720|480|360)p?/i.exec(url) || [])[1] || '默认';
            result.push({ name: quality === '默认' ? quality : quality + 'p', url: url, quality: Number(quality) || 0 });
        }
        result.sort(function (a, b) { return b.quality - a.quality; });
        return result;
    }
    function parseDetail(page) {
        var html = page.html, bodyText = text(html), title = meta(html, 'og:title') || first(html, ['h1&&Text']) || '', description = meta(html, 'og:description');
        var published = (/(20\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2})/.exec(bodyText) || [])[1] || '';
        var views = (/(?:觀看次數|观看次数)\s*[:：]?\s*([^\s]{1,24})/.exec(bodyText) || [])[1] || '';
        return { url: page.url, title: title, image: meta(html, 'og:image'), description: description, publishedAt: published, views: views, authors: links(html, /(?:author|creator|artist|studio|user)/i, page.url), tags: links(html, /(?:search|tag|category|type)=|\/(?:tag|category)\//i, page.url), playlist: parseCards(html, page.url, 50), streams: parseStreams(html), iframe: (/<iframe\b[^>]*src\s*=\s*["\']([^"\']+)/i.exec(html) || [])[1] || '' };
    }
    function readList(name) { try { return storage0.getMyVar(cacheKey(name)) || []; } catch (ignore) { return []; } }
    function writeList(name, value) { try { storage0.putMyVar(cacheKey(name), value); } catch (ignore) {} return value; }
    function toggleFavorite(item) {
        var list = readList('favorites'), output = [], exists = false;
        for (var i = 0; i < list.length; i++) { if (list[i].url === item.url) exists = true; else output.push(list[i]); }
        if (!exists) output.unshift({ url: item.url, title: item.title || '', image: item.image || '', savedAt: now() });
        writeList('favorites', output); return !exists;
    }
    function addHistory(item) {
        var old = readList('history'), output = [{ url: item.url, title: item.title || '', image: item.image || '', watchedAt: now() }];
        for (var i = 0; i < old.length && output.length < CONFIG.limits.history; i++) if (old[i].url !== item.url) output.push(old[i]);
        return writeList('history', output);
    }
    function playerHeaders(page) {
        var session = verifiedSession();
        var headers = { Referer: page.url, Origin: origin(page.url), 'User-Agent': session && session.ua ? session.ua : CONFIG.userAgent };
        if (page.cookie) headers.Cookie = page.cookie;
        else if (session && session.cookie) headers.Cookie = session.cookie;
        return headers;
    }

    var exported = {
        config: CONFIG, text: text, absolute: absolute, request: request, fetchCached: fetchCached,
        parseCards: parseCards, parseNav: parseNav, parseGenres: parseGenres, parseSorts: parseSorts,
        parseYears: parseYears, parseMonths: parseMonths, parseTagOptions: parseTagOptions, parseSections: parseSections,
        parseDetail: parseDetail, playerHeaders: playerHeaders, readList: readList, toggleFavorite: toggleFavorite,
        addHistory: addHistory, verifiedCookie: verifiedCookie, verifiedSession: verifiedSession, saveSession: saveSession, importCookie: importCookie
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();

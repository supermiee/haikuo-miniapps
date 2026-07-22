/* Hanime1 公共内核：请求、解析、缓存与播放地址处理。 */
(function () {
    var CONFIG = {
        version: '3',
        sources: ['https://hanime1.me'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        timeout: 12000,
        cachePrefix: 'hanime1.',
        limits: { home: 12, history: 100 }
    };

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
        try { return String(getVar(CONFIG.cachePrefix + 'webCookie', '') || ''); } catch (ignore) { return ''; }
    }
    function usable(html, marker) {
        if (!html || html.length < 300) return false;
        if (/just a moment|cf-chl|challenges\.cloudflare\.com|enable javascript and cookies/i.test(html)) return false;
        return !marker || String(html).indexOf(marker) >= 0;
    }
    function replaceHost(url, host) { return String(url || '').replace(/^https?:\/\/[^/]+/i, host); }
    function requestByWebView(url, options) {
        if (typeof fetchCodeByWebView === 'undefined') return null;
        try {
            var html = fetchCodeByWebView(url, {
                headers: { 'User-Agent': CONFIG.userAgent, Referer: origin(url) + '/' },
                timeout: (options && options.webViewTimeout) || 30000,
                checkJs: $.toString(function () {
                    return document.querySelector('a[href*="/watch?v="], a[href*="/watch/"], meta[property="og:title"]');
                })
            });
            if (usable(html, options && options.marker)) return { ok: true, url: url, html: html, cookie: '', status: 200, via: 'webview' };
        } catch (error) { return { error: String(error) }; }
        return null;
    }
    function request(url, options) {
        options = options || {};
        var failures = [];
        for (var i = 0; i < CONFIG.sources.length; i++) {
            var target = replaceHost(url, CONFIG.sources[i]);
            try {
                var headers = { 'User-Agent': CONFIG.userAgent, Referer: CONFIG.sources[i] + '/' }, cookie = verifiedCookie();
                if (cookie) headers.Cookie = cookie;
                var raw = fetchPC(target, { headers: headers, timeout: options.timeout || CONFIG.timeout, withStatusCode: true, withHeaders: true });
                var page = response(raw), html = page.body || '', status = Number(page.statusCode || 0);
                if ((status === 0 || status < 400) && usable(html, options.marker)) {
                    return { ok: true, url: target, html: html, cookie: responseCookie(page.headers), status: status || 200 };
                }
                failures.push({ source: CONFIG.sources[i], status: status, reason: /cloudflare|just a moment/i.test(html) ? 'Cloudflare verification' : 'unexpected page structure' });
            } catch (error) { failures.push({ source: CONFIG.sources[i], status: 0, reason: String(error) }); }
        }
        /* WebView executes the public page's JavaScript. It is a fallback for a verified user session, not a challenge bypass. */
        var webView = requestByWebView(url, options);
        if (webView && webView.ok) return webView;
        if (webView && webView.error) failures.push({ source: 'webview', status: 0, reason: webView.error });
        return { ok: false, url: url, error: { code: 'NETWORK_OR_VERIFICATION', message: '站点不可用或需要在网页完成验证', failures: failures } };
    }
    function cacheKey(key) { return CONFIG.cachePrefix + key; }
    function readCache(key, ttl) {
        try { var item = storage0.getMyVar(cacheKey(key)); return item && now() - item.savedAt < ttl * 1000 ? item.value : null; } catch (ignore) { return null; }
    }
    function fetchCached(url, options, ttl) {
        var key = 'page.' + String(url), cached = readCache(key, ttl || 180);
        if (cached) return cached;
        var page = request(url, options);
        if (page.ok) try { storage0.putMyVar(cacheKey(key), { savedAt: now(), value: page }); } catch (ignore) {}
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
        var views = (/(\d[\d,.]*\s*[萬万]?(?:次觀看|次观看|views?))/.exec(clean) || [])[1] || '';
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
    function parseNav(html, baseUrl) {
        var names = { '裏番': 1, '泡麵番': 1, 'Motion Anime': 1, '3DCG': 1, '2.5D': 1, '2D動畫': 1, 'AI生成': 1, 'MMD': 1, 'Cosplay': 1, '新番預告': 1 }, anchors = String(html || '').match(/<a\b[^>]*href\s*=\s*["\'][^"\']+["\'][^>]*>[\s\S]*?<\/a>/ig) || [], result = [], seen = {};
        for (var i = 0; i < anchors.length; i++) {
            var title = text(anchors[i]), url = absolute(attr(anchors[i], 'href'), baseUrl);
            if (names[title] && url && !seen[url]) { seen[url] = true; result.push({ title: title, url: url }); }
        }
        return result;
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
    function playerHeaders(page) { var headers = { Referer: page.url, Origin: origin(page.url), 'User-Agent': CONFIG.userAgent }; if (page.cookie) headers.Cookie = page.cookie; return headers; }

    var exported = { config: CONFIG, text: text, absolute: absolute, request: request, fetchCached: fetchCached, parseCards: parseCards, parseNav: parseNav, parseDetail: parseDetail, playerHeaders: playerHeaders, readList: readList, toggleFavorite: toggleFavorite, addHistory: addHistory, verifiedCookie: verifiedCookie };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();

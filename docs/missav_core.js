/* MissAV 完整版公共内核。部署到 hiker://files/rules/missav/ 后由 $.require() 引用。 */
(function () {
    var CONFIG = {
        version: '0.1.0',
        source: 'https://missav.live',
        locale: 'cn',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        timeout: 12000,
        cachePrefix: 'missav.full.',
        limits: { home: 6, history: 200 }
    };

    function now() { return new Date().getTime(); }
    function cacheKey(key) { return CONFIG.cachePrefix + key; }
    function text(value) {
        return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
            .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
    }
    function absolute(value, baseUrl) {
        var url = String(value || '').replace(/&amp;/gi, '&').trim();
        if (!url || /^javascript:/i.test(url)) return '';
        if (/^https?:\/\//i.test(url)) return url;
        var host = /^https?:\/\/[^/]+/i.exec(String(baseUrl || CONFIG.source));
        return (host ? host[0] : CONFIG.source) + (url.charAt(0) === '/' ? url : '/' + url);
    }
    function parseResponse(raw) {
        if (!raw) return null;
        try { var parsed = JSON.parse(raw); if (parsed && typeof parsed.body !== 'undefined') return parsed; } catch (ignore) {}
        return { body: String(raw), statusCode: 200, headers: {} };
    }
    function isUsableHtml(html, marker) {
        if (!html || html.length < 300) return false;
        if (/cloudflare|just a moment|captcha|access denied|enable javascript/i.test(html)) return false;
        return !marker || String(html).indexOf(marker) >= 0;
    }
    function diagnostic(entry) {
        try {
            var all = storage0.getMyVar(cacheKey('diagnostics')) || [];
            all.unshift(entry); storage0.putMyVar(cacheKey('diagnostics'), all.slice(0, 30));
        } catch (ignore) {}
    }
    function request(url, options) {
        options = options || {};
        var target = absolute(url, CONFIG.source), started = now();
        try {
            var raw = fetchPC(target, { headers: { 'User-Agent': CONFIG.userAgent, 'Referer': CONFIG.source + '/' }, timeout: options.timeout || CONFIG.timeout, withStatusCode: true });
            var response = parseResponse(raw), status = Number(response && response.statusCode || 0), body = response && response.body || '';
            if ((status === 0 || (status >= 200 && status < 400)) && isUsableHtml(body, options.marker || '')) {
                diagnostic({ event: 'request', ok: true, status: status || 200, ms: now() - started, url: target });
                return { ok: true, html: body, url: target, status: status || 200 };
            }
            throw new Error(status ? ('HTTP ' + status) : '需要网页验证');
        } catch (error) {
            diagnostic({ event: 'request', ok: false, ms: now() - started, url: target, error: String(error) });
            return { ok: false, url: target, error: { code: 'NETWORK_OR_VERIFICATION', message: '站点不可用或需要在网页中完成人工验证' } };
        }
    }
    function readCache(key, ttl) {
        try { var item = storage0.getMyVar(cacheKey(key)); return item && now() - item.savedAt < ttl * 1000 ? item.value : null; } catch (ignore) { return null; }
    }
    function fetchCached(url, options, ttl) {
        var key = 'page.' + String(url), cached = readCache(key, ttl || 300);
        if (cached) return cached;
        var page = request(url, options);
        try { if (page.ok) storage0.putMyVar(cacheKey(key), { savedAt: now(), value: page }); } catch (ignore) {}
        return page;
    }
    function attr(html, name) {
        var match = new RegExp('\\s' + name + '\\s*=\\s*["\\\']([^"\\\']+)["\\\']', 'i').exec(String(html || ''));
        return match ? match[1] : '';
    }
    function meta(html, property) {
        var re = new RegExp('<meta\\b[^>]*(?:property|name)=["\\\']' + property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\\\'][^>]*>', 'ig');
        var tag = re.exec(String(html || ''));
        return tag ? text(attr(tag[0], 'content')) : '';
    }
    function unique(items, key) {
        var seen = {}, result = [];
        for (var i = 0; i < items.length; i++) { var value = items[i]; if (value && !seen[value[key]]) { seen[value[key]] = true; result.push(value); } }
        return result;
    }
    function parseCards(html, baseUrl, limit) {
        var blocks = String(html || '').match(/<div\b[^>]*class=["'][^"']*\bthumbnail\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/ig) || [];
        var cards = [];
        for (var i = 0; i < blocks.length; i++) {
            var block = blocks[i], href = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block), image = /<img\b[^>]*(?:data-src|src)=["']([^"']+)["']/i.exec(block);
            var title = /class=["'][^"']*text-secondary[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
            var duration = />(\d{1,2}:\d{2}:\d{2})</.exec(block), badge = /absolute[^"']*bottom-1[^"']*left-1[^"']*[^>]*>([\s\S]*?)<\//i.exec(block);
            var url = absolute(href && href[1], baseUrl), name = text(title && title[1]);
            if (url && name && /\/cn\//i.test(url)) cards.push({ url: url, title: name, image: absolute(image && image[1], baseUrl), duration: duration ? duration[1] : '', badge: text(badge && badge[1]) });
        }
        cards = unique(cards, 'url');
        return typeof limit === 'number' ? cards.slice(0, limit) : cards;
    }
    function parseCount(html) {
        var match = String(html || '').match(/([\d,]+)\s*条影片/);
        return match ? match[1].replace(/,/g, '') : '';
    }
    function parseGenres(html, baseUrl) {
        var source = String(html || ''), result = [], match;
        var paired = /<div>\s*<a\b[^>]*href=["']([^"']*\/genres\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]{0,900}?<a\b[^>]*href=["']([^"']*\/genres\/[^"']+)["'][^>]*>([\s\S]*?\d[\d,]*\s*条影片[\s\S]*?)<\/a>[\s\S]*?<\/div>/ig;
        while ((match = paired.exec(source))) {
            var pairUrl = absolute(match[1], baseUrl), pairTitle = text(match[2]), pairCount = text(match[4]);
            if (pairUrl && pairTitle) result.push({ url: pairUrl, title: pairTitle, count: pairCount });
        }
        if (result.length) return unique(result, 'url');
        var anchors = source.match(/<a\b[^>]*href=["'][^"']*\/genres\/[^"']+["'][^>]*>[\s\S]*?<\/a>/ig) || [];
        for (var i = 0; i < anchors.length; i++) {
            var href = /href=["']([^"']+)["']/i.exec(anchors[i]), url = absolute(href && href[1], baseUrl), name = text(anchors[i]);
            if (url && name && !/\/genres\/?(?:\?|$)/i.test(url)) result.push({ url: url, title: name, count: '' });
        }
        return unique(result, 'url');
    }
    function field(html, label) {
        var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var match = new RegExp('<span[^>]*>\\s*' + escaped + '\\s*[:：]?\\s*<\\/span>([\\s\\S]{0,1200}?)<\\/div>', 'i').exec(String(html || ''));
        return match ? text(match[1]) : '';
    }
    function fieldLinks(html, label, baseUrl) {
        var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var match = new RegExp('<span[^>]*>\\s*' + escaped + '\\s*[:：]?\\s*<\\/span>([\\s\\S]{0,3000}?)<\\/div>', 'i').exec(String(html || ''));
        if (!match) return [];
        var anchors = match[1].match(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/ig) || [], result = [];
        for (var i = 0; i < anchors.length; i++) {
            var href = /href=["']([^"']+)["']/i.exec(anchors[i]), url = absolute(href && href[1], baseUrl), title = text(anchors[i]);
            if (url && title) result.push({ title: title, url: url });
        }
        return unique(result, 'url');
    }
    function duration(seconds) {
        seconds = Number(seconds || 0); if (!seconds) return '';
        var h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
        return h + ':' + ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
    }
    function parseDirectUrls(html) {
        var match = /directUrls\s*:\s*JSON\.parse\('([\s\S]*?)'\)/i.exec(String(html || ''));
        if (!match) return [];
        try {
            var encoded = match[1].replace(/\\u0022/g, '"').replace(/\\\//g, '/').replace(/\\\\/g, '\\');
            var urls = JSON.parse(encoded), result = [];
            for (var i = 0; i < urls.length; i++) if (/^https?:\/\//i.test(urls[i])) result.push(urls[i]);
            return result;
        } catch (ignore) { return []; }
    }
    function parseDetail(html, baseUrl) {
        return {
            url: baseUrl,
            title: meta(html, 'og:title') || field(html, '标题'),
            image: meta(html, 'og:image'),
            releaseDate: field(html, '发行日期') || meta(html, 'og:video:release_date'),
            duration: duration(meta(html, 'og:video:duration')),
            code: field(html, '番号'), originalTitle: field(html, '标题'),
            actors: fieldLinks(html, '女优', baseUrl), genres: fieldLinks(html, '类型', baseUrl),
            series: fieldLinks(html, '系列', baseUrl), makers: fieldLinks(html, '发行商', baseUrl),
            directors: fieldLinks(html, '导演', baseUrl), labels: fieldLinks(html, '标籤', baseUrl),
            directUrls: parseDirectUrls(html), recommendations: parseCards(html, baseUrl, 12)
        };
    }
    function readList(name) { try { return storage0.getMyVar(cacheKey(name)) || []; } catch (ignore) { return []; } }
    function writeList(name, list) { try { storage0.putMyVar(cacheKey(name), list); } catch (ignore) {} return list; }
    function isFavorite(url) { var list = readList('favorites'); for (var i = 0; i < list.length; i++) if (list[i].url === url) return true; return false; }
    function toggleFavorite(item) {
        var list = readList('favorites'), next = [], exists = false;
        for (var i = 0; i < list.length; i++) { if (list[i].url === item.url) exists = true; else next.push(list[i]); }
        if (!exists) next.unshift({ url: item.url, title: item.title || '', image: item.image || '', savedAt: now() });
        writeList('favorites', next); return !exists;
    }
    function addHistory(item) {
        var list = readList('history'), next = [{ url: item.url, title: item.title || '', image: item.image || '', viewedAt: now() }];
        for (var i = 0; i < list.length && next.length < CONFIG.limits.history; i++) if (list[i].url !== item.url) next.push(list[i]);
        return writeList('history', next);
    }
    var exported = { config: CONFIG, text: text, absolute: absolute, request: request, fetchCached: fetchCached, parseCards: parseCards, parseCount: parseCount, parseGenres: parseGenres, parseDetail: parseDetail, isFavorite: isFavorite, toggleFavorite: toggleFavorite, addHistory: addHistory, readList: readList, writeList: writeList };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (typeof $ !== 'undefined') $.exports = exported;
})();

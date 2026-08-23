/*
 * Hanime1 小程序冒烟测试。无依赖，直接 `node test/hanime.test.js` 运行。
 * 桩掉海阔全局 API，在 Node 中真实执行 docs/hanime_*.js 的主要代码路径，
 * 并校验订阅 JSON 版本与所有 ?v= 字面量的一致性（漏改任何一处即失败）。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');
var CORE_PATH = path.join(ROOT, 'docs', 'hanime_core.js');
var PAGES_PATH = path.join(ROOT, 'docs', 'hanime_pages.js');

function freshRequire(file) {
    delete require.cache[require.resolve(file)];
    return require(file);
}

/* ---------- Hiker 全局桩 ---------- */
var store = {};
global.storage0 = {
    getMyVar: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    putMyVar: function (k, v) { store[k] = v; }
};
global.getVar = function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d; };
global.putVar = function (k, v) { store[k] = v; };

/* 最小 pdfa/pdfh：只解析 <a href*=...> 锚块，够 hanime 卡片选择器使用 */
global.pdfa = function (html, selector) {
    if (!/a\[href\*="\/watch/.test(selector)) return [];
    var out = [], re = /<a\b[^>]*href\s*=\s*["'][^"']*\/watch\?v=[^"']*["'][^>]*>[\s\S]*?<\/a>/ig, m;
    while ((m = re.exec(String(html)))) out.push(m[0]);
    return out;
};
global.pdfh = function (html, selector) {
    var m = /^([a-z]+)&&([a-z-]+)$/i.exec(String(selector));
    if (!m) return '';
    var tag = m[1].toLowerCase(), attrName = m[2];
    if (attrName === 'Text') {
        var block = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'i').exec(String(html));
        return block ? block[1].replace(/<[^>]*>/g, '').trim() : '';
    }
    var el = new RegExp('<' + tag + '\\b[^>]*>', 'i').exec(String(html));
    if (!el) return '';
    var av = new RegExp('\\s' + attrName + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(el[0]);
    return av ? av[1] : '';
};

global.setPageTitle = function () {};
global.setPagePicUrl = function () {};
global.refreshPage = function () {};
global.back = function () {};
var MY_PAGE_VALUE = 1;
Object.defineProperty(global, 'MY_URL', { get: function () { return ''; } });
Object.defineProperty(global, 'MY_PAGE', { get: function () { return MY_PAGE_VALUE; } });

var lastResult = null, lastHome = null, fetchedUrls = [];
global.setResult = function (r) { lastResult = r; };
global.setHomeResult = function (r) { lastHome = r; };

var FETCH_MODE = 'ok';
var FIXTURE_HOME = [
    '<html><head><title>hanime</title></head><body>',
    '<nav><a href="/search?genre=%E8%A3%8F%E7%95%AA">裏番</a><a href="/search?genre=MMD">MMD</a></nav>',
    '<div class="home-rows-videos-div">' +
    '<a class="overlay" href="https://hanime1.me/watch?v=1001"><img src="//assets/h1.jpg" alt="片名一"><div class="card-mobile-title">片名一</div></a>',
    '<a class="overlay" href="https://hanime1.me/watch?v=1002"><img src="//assets/h2.jpg" alt="片名二"><div class="card-mobile-title">片名二</div></a>',
    '</div>',
    '<script>var p="https:\\/\\/cdn.example.com\\/hls\\/ep1_x_1080.m3u8";</script>',
    '</body></html>'
].join('');
var FIXTURE_WATCH = [
    '<html><head>',
    '<meta property="og:title" content="测试影片">',
    '<meta property="og:image" content="https://img.example.com/cover.jpg">',
    '<meta property="og:description" content="简介文字">',
    '</head><body><h1>测试影片</h1>',
    '<a href="/search?type=tag">标签A</a>',
    '<script>sources=[{src:"https:\\/\\/cdn.example.com\\/watch_1080.m3u8"},{src:"https://cdn.example.com/watch_720.m3u8"}];</script>',
    '</body></html>'
].join('');

global.fetchPC = function (url) {
    fetchedUrls.push(String(url));
    if (FETCH_MODE === 'block') {
        return JSON.stringify({ body: '<html><head><title>Attention Required! | Cloudflare</title></head><body>error code: 1020</body></html>', headers: {}, statusCode: 403 });
    }
    if (String(url).indexOf('/watch') >= 0) return JSON.stringify({ body: FIXTURE_WATCH, headers: {}, statusCode: 200 });
    return JSON.stringify({ body: FIXTURE_HOME, headers: {}, statusCode: 200 });
};

function makeDollar() {
    var dollar = function (u) {
        return {
            rule: function (cb, params) { return JSON.stringify({ ruleCb: String(cb).slice(0, 40), params: params }); },
            lazyRule: function (cb) { return JSON.stringify({ lazyCb: String(cb).slice(0, 40) }); }
        };
    };
    dollar.require = function (p) {
        var target = String(p).indexOf('hanime_core') >= 0 ? CORE_PATH : PAGES_PATH;
        if (String(p).indexOf('supermiee.github.io') < 0 && String(p).indexOf('hiker://') < 0 && !target) throw new Error('unmapped require: ' + p);
        return target === PAGES_PATH ? pages : core;
    };
    dollar.toString = function (fn) { return '(' + fn.toString() + ')'; };
    return dollar;
}

var core = freshRequire(CORE_PATH);
var pages = freshRequire(PAGES_PATH);
global.$ = makeDollar();

/* ---------- 用例 ---------- */
var passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '::', e.message); }
}

test('模块可加载且导出齐全', function () {
    ['renderHome', 'renderList', 'renderDetail', 'renderVerification', 'routeSearch'].forEach(function (k) {
        assert.strictEqual(typeof pages[k], 'function', '缺少导出 ' + k);
    });
    assert.strictEqual(typeof core.parseCards, 'function');
});

test('renderHome 正常解析首页（卡片+导航）', function () {
    FETCH_MODE = 'ok'; store = {}; fetchedUrls = [];
    pages.renderHome();
    assert.ok(Array.isArray(lastHome), '未输出首页');
    var titles = lastHome.map(function (c) { return c.title; });
    assert.ok(titles.indexOf('裏番') >= 0, '导航缺失 裏番');
    assert.ok(titles.indexOf('片名一') >= 0, '卡片缺失 片名一');
});

test('CF 拦截时 renderHome 输出失败卡片并带重试入口', function () {
    FETCH_MODE = 'block'; store = {}; fetchedUrls = [];
    pages.renderHome();
    assert.ok(Array.isArray(lastHome), '未输出失败卡片');
    var titles = lastHome.map(function (c) { return c.title; }).join(',');
    assert.ok(titles.indexOf('重试') >= 0, '缺重试按钮');
    assert.ok(titles.indexOf('验证并同步') >= 0, '缺验证入口');
    assert.ok(/站点不可用|验证/.test(lastHome[0].title), '失败原因不准确: ' + lastHome[0].title);
    FETCH_MODE = 'ok';
});

test('搜索关键词含 % 不再抛 URIError（回归）', function () {
    ['100%', 'a&b', 'c=d'].forEach(function (kw) {
        pages.renderList({ url: 'https://hanime1.me/search?query=' + kw, title: '搜索', page: 1 });
        assert.ok(Array.isArray(lastResult), '关键词 ' + kw + ' 导致崩溃');
    });
});

test('翻页 URL 构建正确（page=2 注入、page=1 清理）', function () {
    store = {}; fetchedUrls = [];
    pages.renderList({ url: 'https://hanime1.me/search?query=x&page=999', title: '列表', page: 1 });
    assert.ok(fetchedUrls[0].indexOf('page=999') < 0, '第 1 页应清理残留 page 参数: ' + fetchedUrls[0]);
    store = {}; fetchedUrls = []; MY_PAGE_VALUE = 2;
    pages.renderList({ url: 'https://hanime1.me/', title: '列表', page: 2 });
    MY_PAGE_VALUE = 1;
    assert.ok(fetchedUrls.some(function (u) { return u.indexOf('page=2') >= 0; }), '第 2 页应带 page=2: ' + fetchedUrls.join(','));
});

test('详情页解析 og 元数据与播放流', function () {
    store = {}; FETCH_MODE = 'ok';
    pages.renderDetail({ url: 'https://hanime1.me/watch?v=1001', title: 'x' });
    var playCard = lastResult.filter(function (c) { return /^▶/.test(c.title); })[0];
    assert.ok(playCard, '缺播放按钮');
    var payload = JSON.parse(playCard.url);
    assert.ok(payload.urls.length >= 2, '应解析出多档清晰度');
    assert.ok(/1080|m3u8/.test(payload.urls[0]), '首档应为最高清 m3u8: ' + payload.urls[0]);
    assert.deepEqual(Object.keys(payload.headers[0]).sort(), ['Origin', 'Referer', 'User-Agent'], '播放头不完整');
});

test('订阅 JSON 版本与 ?v= 字面量全量一致', function () {
    var moduleVersion = /MODULE_VERSION\s*=\s*'(\d+)'/.exec(fs.readFileSync(PAGES_PATH, 'utf8'))[1];
    [path.join(ROOT, 'docs', 'jable-subscription.json'), path.join(ROOT, 'docs', 'hanime-subscription.json')].forEach(function (file) {
        var entries = JSON.parse(fs.readFileSync(file, 'utf8')).filter(function (e) { return /hanime/i.test(e.title); });
        entries.forEach(function (entry) {
            assert.strictEqual(String(entry.version), moduleVersion, file + ' version 与 MODULE_VERSION 不一致');
            ['find_rule', 'searchFind'].forEach(function (field) {
                assert.strictEqual(entry[field].indexOf('?v=' + moduleVersion) >= 0, true, file + ' ' + field + ' 缺 ?v=' + moduleVersion);
                assert.strictEqual(entry[field].indexOf('?v=') !== entry[field].lastIndexOf('?v='), false, file + ' ' + field + ' 含多个不同 ?v=');
            });
        });
    });
    var pagesSource = fs.readFileSync(PAGES_PATH, 'utf8');
    var literals = pagesSource.match(/\?v=(\d+)/g) || [];
    literals.forEach(function (lit) {
        assert.strictEqual(lit, '?v=' + moduleVersion, 'hanime_pages.js 存在过期字面量 ' + lit);
    });
    assert.ok(literals.length >= 2, '回调内 ?v= 字面量疑似被误删');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

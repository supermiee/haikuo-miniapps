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
var CORE_PATH = path.join(ROOT, 'docs', 'apps', 'hanime', 'hanime_core.js');
var PAGES_PATH = path.join(ROOT, 'docs', 'apps', 'hanime', 'hanime_pages.js');

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
global.listMyVarKeys = function () { return Object.keys(store); };
global.clearMyVar = function (k) { delete store[k]; };

/* 最小 pdfa/pdfh：解析 <a href*=watch> 锚块与标签属性，覆盖 hanime 用到的选择器 */
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
/* 首页 fixture：genre 下拉导航 + 两个「查看更多」板块（各含卡片）+ 播放流脚本 */
var GENRE_DROPDOWN = ['全部', '裏番', '泡麵番', 'Motion Anime', '3DCG', '2.5D', '2D動畫', 'AI生成', 'MMD', 'Cosplay']
    .map(function (g) { return '<div class="simple-dropdown-item genre-option" data-value="' + g + '"><div class="hentai-sort-options">' + g + '</div></div>'; }).join('');
function watchCard(id, title) {
    return '<a class="overlay" href="https://hanime1.me/watch?v=' + id + '"><img src="//assets/' + id + '.jpg" alt="' + title + '"><div class="card-mobile-title">' + title + '</div></a>';
}
function sectionAnchor(sortOrGenre, value, title) {
    var href = '/search?' + sortOrGenre + '=' + encodeURIComponent(value);
    return '<a style="text-decoration:none;" href="' + href + '"><h3>' + title + '<div><span class="hidden-xs">查看</span>更多<span class="material-icons">arrow_forward_ios</span></div></h3></a>';
}
var FIXTURE_HOME = [
    '<html><head><title>hanime</title></head><body>',
    '<div class="dropdown-menu">', GENRE_DROPDOWN, '</div>',
    '<nav><a href="/previews/202608"><i class="material-icons">cast</i>新番預告</a></nav>',
    sectionAnchor('sort', '最新上市', '最新上市'), watchCard(1001, '片名一'), watchCard(1002, '片名二'),
    sectionAnchor('sort', '最新上傳', '最新上傳'), watchCard(1003, '片名三'),
    '<script>var p="https:\\/\\/cdn.example.com\\/hls\\/ep1_x_1080.m3u8";</script>',
    '</body></html>'
].join('');
/* 列表页 fixture：排序面板 / 年月下拉 / tags[] 复选框，与站点结构一致 */
var FIXTURE_SEARCH = [
    '<html><head><meta property="og:title" content="搜索"></head><body>',
    '<form id="search-form"></form>',
    '<div id="sort-wrapper" class="modal fade" role="dialog"><form id="hentai-sort-panel">',
    '<input type="hidden" id="sort" name="sort" value="">',
    ['本日排行', '最新內容', '最新上傳', '觀看次數'].map(function (s) { return '<div class="hentai-sort-options-wrapper"><div class="hentai-sort-options">' + s + '</div></div>'; }).join(''),
    '</form></div>',
    '<select name="year"><option value="">全部年份...</option><option value="2026">2026年</option><option value="2025">2025年</option></select>',
    '<select name="month"><option value="">全部月份...</option><option value="1">1月</option><option value="2">2月</option></select>',
    '<label class="hentai-tags-wrapper"><input name="tags[]" type="checkbox" value="巨乳"><span class="checkmark">巨乳</span></label>',
    '<label class="hentai-tags-wrapper"><input name="tags[]" type="checkbox" value="人妻"><span class="checkmark">人妻</span></label>',
    '<div class="dropdown-menu">', GENRE_DROPDOWN, '</div>',
    watchCard(2001, '结果一'), watchCard(2002, '结果二'),
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
    if (String(url).indexOf('/search') >= 0) return JSON.stringify({ body: FIXTURE_SEARCH, headers: {}, statusCode: 200 });
    return JSON.stringify({ body: FIXTURE_HOME, headers: {}, statusCode: 200 });
};

var core = freshRequire(CORE_PATH);
var pages = freshRequire(PAGES_PATH);
/* 其余两个应用同样要求可加载（验证机制移植后的回归底线） */
function appPath(app, file) { return path.join(ROOT, 'docs', 'apps', app, file); }
var jableCore = freshRequire(appPath('jable', 'jable_core.js'));
var jablePages = freshRequire(appPath('jable', 'jable_pages.js'));
var missavCore = freshRequire(appPath('missav', 'missav_core.js'));
var missavPages = freshRequire(appPath('missav', 'missav_pages.js'));
var dollar = function (u) {
    return {
        rule: function (cb, params) { return JSON.stringify({ method: params && params.method, inner: params && params.params }); },
        lazyRule: function (cb) { return JSON.stringify({ lazy: String(cb) }); }
    };
};
dollar.require = function (p) {
    var s = String(p);
    if (s.indexOf('jable_core') >= 0) return jableCore;
    if (s.indexOf('jable_pages') >= 0) return jablePages;
    if (s.indexOf('missav_core') >= 0) return missavCore;
    if (s.indexOf('missav_pages') >= 0) return missavPages;
    return s.indexOf('hanime_core') >= 0 ? core : pages;
};
dollar.toString = function (fn) { return '(' + fn.toString() + ')'; };
global.$ = dollar;

/* ---------- 用例 ---------- */
var passed = 0, failed = 0;
function titles(cards) { return cards.map(function (c) { return c.title; }); }
function test(name, fn) {
    try { fn(); passed++; console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '::', e.message); }
}

test('模块可加载且导出齐全', function () {
    ['renderHome', 'renderList', 'renderDetail', 'renderVerification', 'routeSearch'].forEach(function (k) {
        assert.strictEqual(typeof pages[k], 'function', '缺少导出 ' + k);
    });
    ['parseSorts', 'parseGenres', 'parseYears', 'parseMonths', 'parseTagOptions', 'parseSections'].forEach(function (k) {
        assert.strictEqual(typeof core[k], 'function', '缺少导出 ' + k);
    });
});

test('插件名为 Hanime1（不含 MVP）', function () {
    [path.join(ROOT, 'docs', 'subscription.json')].forEach(function (file) {
        JSON.parse(fs.readFileSync(file, 'utf8')).filter(function (e) { return /hanime/i.test(e.title); }).forEach(function (e) {
            assert.strictEqual(e.title, 'Hanime1', file + ' 标题仍为: ' + e.title);
        });
    });
});

test('首页菜单与源站一致（类型导航+新番預告），且正常时无验证入口', function () {
    FETCH_MODE = 'ok'; store = {}; fetchedUrls = [];
    pages.renderHome();
    var t = titles(lastHome);
    assert.ok(Array.isArray(lastHome), '未输出首页');
    assert.ok(t.indexOf('裏番') >= 0 && t.indexOf('Cosplay') >= 0, '类型导航缺失');
    assert.ok(t.indexOf('新番預告') >= 0, '新番預告入口缺失');
    assert.ok(t.indexOf('验证并同步') < 0, '未遇挑战不应显示验证入口');
    assert.ok(t.indexOf('片名一') >= 0, '首页板块卡片缺失');
    assert.ok(t.indexOf('最新上市') >= 0 && t.indexOf('最新上傳') >= 0, '首页板块标题缺失');
});

test('被拦截时失败视图包含验证并同步与重试', function () {
    FETCH_MODE = 'block'; store = {}; fetchedUrls = [];
    pages.renderHome();
    var t = titles(lastHome).join(',');
    assert.ok(t.indexOf('验证并同步') >= 0, '缺验证入口');
    assert.ok(t.indexOf('重试') >= 0, '缺重试');
    assert.ok(/验证|不可用/.test(lastHome[0].title), '失败原因不准确: ' + lastHome[0].title);
    FETCH_MODE = 'ok';
});

test('列表筛选菜单与源站一致（排序/類型/年份/月份/標籤）', function () {
    store = {}; fetchedUrls = [];
    pages.renderList({ url: 'https://hanime1.me/search?query=巨乳', title: '搜索', page: 1 });
    var t = titles(lastResult).join('|');
    ['排序', '本日排行', '觀看次數', '類型', '裏番', '年份', '2026年', '月份', '2月', '標籤', '巨乳', '人妻'].forEach(function (need) {
        assert.ok(t.indexOf(need) >= 0, '筛选缺少: ' + need);
    });
});

test('點擊標籤生成 tags[] 参数、再点取消；排序/年份单选切换', function () {
    store = {}; fetchedUrls = [];
    pages.renderList({ url: 'https://hanime1.me/search?query=巨乳', title: '搜索', page: 1 });
    function chipUrl(label) {
        var card = lastResult.filter(function (c) { return c.title === label; })[0];
        return card ? JSON.parse(card.url).inner.url : '';
    }
    var withTag = chipUrl('人妻');
    assert.ok(withTag.indexOf('tags%5B%5D=%E4%BA%BA%E5%A6%BB') >= 0 || withTag.indexOf('tags[]=人妻') >= 0 || withTag.indexOf(encodeURIComponent('人妻')) >= 0, '标签参数未写入: ' + withTag);
    pages.renderList({ url: withTag, title: '搜索', page: 1 });
    assert.ok(titles(lastResult).indexOf('✓ 人妻') >= 0, '已选标签未回显 ✓');
    var offAgain = chipUrl('✓ 人妻');
    pages.renderList({ url: offAgain, title: '搜索', page: 1 });
    assert.ok(titles(lastResult).indexOf('✓ 人妻') < 0, '再次点击后不应再回显 ✓');
    assert.ok(titles(lastResult).indexOf('人妻') >= 0, '取消后标签应回到未选态');
    var withYear = chipUrl('2026年');
    assert.ok(decodeURIComponent(withYear.split('?')[1] || '').indexOf('year=2026') >= 0, '年份参数未写入: ' + withYear);
    pages.renderList({ url: withYear, title: '搜索', page: 1 });
    assert.ok(titles(lastResult).indexOf('✓ 2026年') >= 0, '年份未回显 ✓');
});

test('搜索关键词含 % 不再抛 URIError（回归）', function () {
    ['100%', 'a&b', 'c=d'].forEach(function (kw) {
        pages.renderList({ url: 'https://hanime1.me/search?query=' + kw, title: '搜索', page: 1 });
        assert.ok(Array.isArray(lastResult), '关键词 ' + kw + ' 导致崩溃');
    });
});

test('翻页保留筛选条件并正确注入 page', function () {
    store = {}; fetchedUrls = []; MY_PAGE_VALUE = 2;
    var url = 'https://hanime1.me/search?query=x&sort=%E6%9C%AC%E6%97%A5%E6%8E%92%E8%A1%8C&tags%5B%5D=%E4%BA%BA%E5%A6%BB';
    pages.renderList({ url: url, title: '搜索', page: 2 });
    MY_PAGE_VALUE = 1;
    var fetched = decodeURIComponent(fetchedUrls.join(','));
    assert.ok(fetchedUrls.some(function (u) { return u.indexOf('page=2') >= 0; }), '第 2 页应带 page=2');
    assert.ok(fetched.indexOf('sort=本日排行') >= 0, '翻页丢失 sort');
    assert.ok(fetched.indexOf('tags[]=人妻') >= 0 || fetched.indexOf('tags%5B%5D=%E4%BA%BA%E5%A6%BB') >= 0 || decodeURIComponent(fetchedUrls[0]).indexOf('tags[]=人妻') >= 0, '翻页丢失标签');
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

test('请求携带中文语言头', function () {
    var seenHeader = false;
    var oldFetch = global.fetchPC;
    global.fetchPC = function (url, opts) {
        seenHeader = /zh-(TW|CN)/i.test(opts && opts.headers && opts.headers['Accept-Language'] || '');
        return oldFetch(url, opts);
    };
    store = {};
    pages.renderList({ url: 'https://hanime1.me/', title: '列表', page: 1 });
    global.fetchPC = oldFetch;
    assert.ok(seenHeader, 'fetchPC 未携带 Accept-Language 中文头');
});

test('订阅 JSON 版本与 ?v= 字面量全量一致（三个应用）', function () {
    var file = path.join(ROOT, 'docs', 'subscription.json');
    var apps = {
        'Jable': { dir: 'jable' },
        'MissAV': { dir: 'missav' },
        'Hanime1': { dir: 'hanime' }
    };
    assert.ok(!fs.existsSync(path.join(ROOT, 'docs', 'jable-subscription.json')), '旧订阅文件未删除');
    assert.ok(!fs.existsSync(path.join(ROOT, 'docs', 'hanime-subscription.json')), '旧订阅文件未删除');
    var entries = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(entries.map(function (e) { return e.title; }), ['Jable', 'MissAV', 'Hanime1'], '汇总订阅条目不符');
    entries.forEach(function (entry) {
        var app = apps[entry.title];
        assert.ok(app, '未知条目: ' + entry.title);
        var pagesFile = path.join(ROOT, 'docs', 'apps', app.dir, app.dir + '_pages.js');
        var source = fs.readFileSync(pagesFile, 'utf8');
        var moduleVersion = /MODULE_VERSION\s*=\s*'(\d+)'/.exec(source)[1];
        assert.strictEqual(String(entry.version), moduleVersion, entry.title + ' version 与 MODULE_VERSION 不一致');
        ['find_rule', 'searchFind'].forEach(function (field) {
            assert.strictEqual(entry[field].indexOf('/apps/' + app.dir + '/') >= 0, true, entry.title + ' ' + field + ' 未指向 apps/ 新路径');
            assert.strictEqual(entry[field].indexOf('?v=' + moduleVersion) >= 0, true, entry.title + ' ' + field + ' 缺 ?v=' + moduleVersion);
        });
        var literals = source.match(/\?v=(\d+)/g) || [];
        literals.forEach(function (lit) {
            assert.strictEqual(lit, '?v=' + moduleVersion, pagesFile + ' 存在过期字面量 ' + lit);
        });
        assert.ok(literals.length >= 1, entry.title + ' 回调内 ?v= 字面量疑似被误删');
    });
});

test('验证页使用移动端 UA 并提供手动导入', function () {
    store = {};
    pages.renderVerification();
    var webviewCard = lastResult.filter(function (c) { return c.col_type === 'x5_webview_single'; })[0];
    assert.ok(webviewCard, '缺内嵌网页卡片');
    /* 回归：v7 曾丢失 url 字段导致卡片无法打开 */
    assert.strictEqual(webviewCard.url, core.config.sources[0] + '/', '内嵌网页卡片缺 url 字段，将无法点击');
    assert.ok(webviewCard.title && webviewCard.title !== webviewCard.url, '标题应为可读文案而非裸链接');
    assert.strictEqual(webviewCard.extra.ua, core.config.mobileUa, '内嵌网页未使用移动端 UA');
    assert.ok(webviewCard.extra.ua.indexOf('Android') > 0 && webviewCard.extra.ua.indexOf('Windows') < 0, 'UA 指纹不是移动端');
    assert.ok(/cf_clearance/.test(webviewCard.extra.js) && /navigator\.userAgent/.test(webviewCard.extra.js), '注入脚本应捕获 cf_clearance 与真实 UA');
    var t = titles(lastResult);
    assert.ok(t.join('|').indexOf('点此返回并刷新') >= 0, '缺第二步返回引导');
    assert.ok(!/在浏览器完成验证/.test(titles(lastResult).join('|')), '不应再引导去外部浏览器验证（凭证不可转移）');
    var inputCard = lastResult.filter(function (c) { return c.col_type === 'input'; })[0];
    assert.ok(inputCard && /\.importCookie\(input\)/.test(inputCard.url), '缺手动导入输入框');
});

test('验证会话成对保存并在请求/播放头中回放', function () {
    store = {}; FETCH_MODE = 'ok';
    var captured = [];
    var oldFetch = global.fetchPC;
    global.fetchPC = function (url, opts) { captured.push(opts && opts.headers || {}); return oldFetch(url, opts); };
    pages.renderList({ url: 'https://hanime1.me/', title: '列表', page: 1 });
    assert.ok(!captured[0].Cookie, '无会话时不应携带 Cookie');
    assert.strictEqual(captured[0]['User-Agent'], core.config.userAgent, '无会话时应使用桌面默认 UA');
    store = {}; /* 清空页面缓存，强制二次真实请求（会话在 putVar 中，随后重存） */
    captured = [];
    core.saveSession('cf_clearance=abc123', 'Mozilla/5.0 (Linux; Android 13) Mobile');
    pages.renderList({ url: 'https://hanime1.me/', title: '列表', page: 1 });
    global.fetchPC = oldFetch;
    assert.strictEqual(captured[0].Cookie, 'cf_clearance=abc123', '会话 Cookie 未回放');
    assert.strictEqual(captured[0]['User-Agent'], 'Mozilla/5.0 (Linux; Android 13) Mobile', '签发 UA 未原样回放');
    var session = core.verifiedSession();
    assert.deepStrictEqual(session, { cookie: 'cf_clearance=abc123', ua: 'Mozilla/5.0 (Linux; Android 13) Mobile' }, '会话读取不一致');
    var playHeaders = core.playerHeaders({ url: 'https://hanime1.me/watch?v=1' });
    assert.strictEqual(playHeaders['User-Agent'], 'Mozilla/5.0 (Linux; Android 13) Mobile', '播放头未回放会话 UA');
    store = {};
});

test('手动导入解析 cf_clearance（完整串或裸值）', function () {
    store = {};
    assert.ok(/已导入/.test(pages.importCookie('cf_clearance=xYz_123; other=1')), '完整串导入失败');
    assert.strictEqual(core.verifiedSession().cookie, 'cf_clearance=xYz_123');
    assert.ok(/已导入/.test(pages.importCookie('BareToken-9_8')), '裸值导入失败');
    assert.strictEqual(core.verifiedSession().cookie, 'cf_clearance=BareToken-9_8');
    assert.ok(/请粘贴|未识别/.test(pages.importCookie('垃圾内容!!')), '非法输入应有提示');
    assert.ok(/请粘贴/.test(pages.importCookie('')), '空输入应有提示');
    store = {};
});

test('硬拦截快速短路：跳过 WebView 兜底，秒级给出验证引导', function () {
    store = {}; FETCH_MODE = 'block';
    var pcCalls = 0, webviewCalls = 0;
    var oldFetch = global.fetchPC, oldWebview = global.fetchCodeByWebView;
    global.fetchPC = function (u, o) { pcCalls++; return oldFetch(u, o); };
    global.fetchCodeByWebView = function () { webviewCalls++; return '<html>ok</html>'; };
    pages.renderList({ url: 'https://hanime1.me/', title: '列表', page: 1 });
    global.fetchPC = oldFetch;
    if (oldWebview === undefined) delete global.fetchCodeByWebView; else global.fetchCodeByWebView = oldWebview;
    FETCH_MODE = 'ok';
    assert.strictEqual(pcCalls, 1, '硬拦后不应重试更多源');
    assert.strictEqual(webviewCalls, 0, '硬拦时 WebView 兜底应被跳过');
    assert.ok(/验证并同步|人机验证/.test(titles(lastResult)[0]), '应直接给出验证引导: ' + titles(lastResult)[0]);
});

test('完整 cookie 串（含 __cf_bm）原样回放', function () {
    store = {};
    core.saveSession('cf_clearance=tok1; __cf_bm=bm123; other=v', 'Mozilla/5.0 MobileUA');
    var seen = null;
    var oldFetch = global.fetchPC;
    global.fetchPC = function (u, o) { seen = o && o.headers || {}; return oldFetch(u, o); };
    pages.renderList({ url: 'https://hanime1.me/', title: '列表', page: 1 });
    global.fetchPC = oldFetch;
    assert.strictEqual(seen.Cookie, 'cf_clearance=tok1; __cf_bm=bm123; other=v', '完整串未回放: ' + seen.Cookie);
    store = {};
});

test('保存会话即作废全部页面缓存', function () {
    store = {};
    storage0.putMyVar('hanime1.page.https://x', { savedAt: new Date().getTime(), value: {} });
    core.saveSession('cf_clearance=fresh', 'ua');
    assert.ok(!Object.prototype.hasOwnProperty.call(store, 'hanime1.page.https://x'), '页面缓存未被清理');
});

test('超时参数收紧（快速识别挑战）', function () {
    assert.ok(core.config.timeout <= 9000, 'fetchPC 超时应 ≤9s: ' + core.config.timeout);
    assert.ok(core.config.webViewTimeout <= 15000, 'WebView 超时应 ≤15s: ' + core.config.webViewTimeout);
});

test('无 UA 会话直接走 WebView 原生通道（不经过 fetchPC）', function () {
    store = {};
    core.saveSession('cf_clearance=jar1', '');
    var pc = 0, wv = 0, oldF = global.fetchPC, oldW = global.fetchCodeByWebView;
    global.fetchPC = function () { pc++; return JSON.stringify({ body: 'x', headers: {}, statusCode: 200 }); };
    var richPage = '<html><body>' + new Array(21).join('<a href="/watch?v=1">v</a>') + '</body></html>'; /* 须 >300 字节过可用线 */
    global.fetchCodeByWebView = function () { wv++; return richPage; };
    try { pages.renderList({ url: 'https://hanime1.me/', title: 'L', page: 1 }); }
    finally { global.fetchPC = oldF; if (oldW === undefined) delete global.fetchCodeByWebView; else global.fetchCodeByWebView = oldW; }
    assert.strictEqual(wv, 1, '应走 WebView 通道');
    assert.strictEqual(pc, 0, '不应再经过 fetchPC（UA 未知无法回放）');
    store = {};
});

test('有会话仍被硬拦时，给 WebView 兜底一次机会', function () {
    store = {};
    core.saveSession('cf_clearance=x', 'UA-A');
    FETCH_MODE = 'block';
    var wv = 0, oldW = global.fetchCodeByWebView;
    global.fetchCodeByWebView = function () { wv++; return '<html>blocked</html>'; };
    try { pages.renderList({ url: 'https://hanime1.me/', title: 'L', page: 1 }); }
    finally { if (oldW === undefined) delete global.fetchCodeByWebView; else global.fetchCodeByWebView = oldW; FETCH_MODE = 'ok'; }
    assert.ok(wv >= 1, '有会话硬拦时应尝试 WebView 兜底');
    store = {};
});

test('硬拦失败短缓存：30s 内重复点击不再发请求，验证后立即失效', function () {
    store = {}; FETCH_MODE = 'block';
    var pc = 0, oldF = global.fetchPC;
    global.fetchPC = function (u, o) { pc++; return oldF(u, o); };
    try {
        pages.renderList({ url: 'https://hanime1.me/', title: 'L', page: 1 });
        pages.renderList({ url: 'https://hanime1.me/', title: 'L', page: 1 });
        assert.strictEqual(pc, 1, '第二次点击命中失败短缓存，不应重复请求');
        core.saveSession('cf_clearance=fresh', 'UA-B'); /* 验证成功 → 缓存全清 */
        pages.renderList({ url: 'https://hanime1.me/', title: 'L', page: 1 });
        assert.strictEqual(pc, 2, '验证后应重新发起真实请求');
    } finally { global.fetchPC = oldF; FETCH_MODE = 'ok'; }
    store = {};
});

test('第二步按钮置位 webviewMode 并清缓存', function () {
    store = {};
    pages.renderVerification();
    var btn = lastResult.filter(function (c) { return /第二步/.test(c.title); })[0];
    assert.ok(btn, '缺第二步按钮');
    var src = JSON.parse(btn.url).lazy;
    assert.ok(/putVar\('hanime1\.webviewMode', '1'\)/.test(src), '未置位 webviewMode');
    assert.ok(/clearPageCache/.test(src), '未清理失败缓存');
    assert.ok(/hanime_core\.js\?v=11/.test(src), '回调内 require 版本字面量过期');
    assert.ok(!/未检测到凭证/.test(src), '不应再做凭证检测（桥接读罐不可靠）');
});

test('webviewMode 置位后请求优先走 WebView，不再打 fetchPC', function () {
    store = {}; FETCH_MODE = 'block';
    store['hanime1.webviewMode'] = '1'; /* 模拟第二步按钮置位 */
    var oldF = global.fetchPC, oldW = global.fetchCodeByWebView;
    var pc = 0, wv = 0;
    global.fetchPC = function (u, o) { pc++; return oldF(u, o); };
    var richPage = '<html><body>' + new Array(21).join('<a href="/watch?v=1">v</a>') + '</body></html>';
    global.fetchCodeByWebView = function () { wv++; return richPage; };
    try {
        pages.renderList({ url: 'https://hanime1.me/', title: 'L1', page: 1 });
        pages.renderList({ url: 'https://hanime1.me/search?query=x', title: 'L2', page: 1 });
        assert.strictEqual(wv, 2, '两次请求都应走 WebView');
        assert.strictEqual(pc, 0, '不应再请求 fetchPC');
    } finally { global.fetchPC = oldF; if (oldW === undefined) delete global.fetchCodeByWebView; else global.fetchCodeByWebView = oldW; FETCH_MODE = 'ok'; }
    store = {};
});

test('注入脚本合并完整 cookie 并整串保存', function () {
    pages.renderVerification();
    var js = lastResult.filter(function (c) { return c.col_type === 'x5_webview_single'; })[0].extra.js;
    assert.ok(/mergeCookies/.test(js), '缺双路合并逻辑');
    assert.ok(/document\.cookie/.test(js) && /getCookie\(String\(location\.href/.test(js), '双通道缺失');
    assert.ok(/cookie: merged/.test(js), '应保存完整 cookie 串而非仅 cf_clearance');
});

test('jable/missav 可加载且具备验证入口', function () {
    ['renderHome', 'renderList', 'renderVerification'].forEach(function (k) {
        assert.strictEqual(typeof jablePages[k], 'function', 'jable 缺导出 ' + k);
        assert.strictEqual(typeof missavPages[k], 'function', 'missav 缺导出 ' + k);
    });
    assert.ok(jableCore.config.mobileUa && jableCore.clearPageCache, 'jable core 缺 WebView 机制');
    assert.ok(missavCore.config.mobileUa && missavCore.clearPageCache, 'missav core 缺 WebView 机制');
    store = {};
    jablePages.renderVerification();
    var jw = lastResult.filter(function (c) { return c.col_type === 'x5_webview_single'; })[0];
    assert.ok(jw && jw.url && jw.extra.ua === jableCore.config.mobileUa, 'jable 验证页结构不完整');
    store = {};
    missavPages.renderVerification();
    var mw = lastResult.filter(function (c) { return c.col_type === 'x5_webview_single'; })[0];
    assert.ok(mw && mw.url && mw.extra.ua === missavCore.config.mobileUa, 'missav 验证页结构不完整');
    var step2 = JSON.parse(lastResult.filter(function (c) { return /第二步/.test(c.title); })[0].url).lazy;
    assert.ok(/putVar\('missav\.webviewMode', '1'\)/.test(step2), 'missav 第二步未置位标志');
    store = {};
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

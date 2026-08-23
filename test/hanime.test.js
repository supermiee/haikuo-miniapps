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
var dollar = function (u) {
    return {
        rule: function (cb, params) { return JSON.stringify({ method: params && params.method, inner: params && params.params }); },
        lazyRule: function (cb) { return JSON.stringify({ lazy: true }); }
    };
};
dollar.require = function (p) {
    return String(p).indexOf('hanime_core') >= 0 ? core : pages;
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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

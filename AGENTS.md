# AGENTS.md

## What this repo is

Static JavaScript rules ("mini-apps") for the Hiker (海阔视界) Android video app. There is **no build system, package.json, or CI** — only `docs/` (GitHub Pages web root), `test/` and `AGENTS.md`.

- `docs/` is served directly by **GitHub Pages** (`https://supermiee.github.io/haikuo-miniapps/`, `.nojekyll` present). Pushing to `main` publishes immediately.
- Layout:
  - `docs/apps/<app>/<app>_core.js` — kernel: HTTP via `fetchPC` (multi-host failover), HTML parsing (regex + Hiker `pdfa`/`pdfh`), caching via `storage0`, diagnostics.
  - `docs/apps/<app>/<app>_pages.js` — page layer: renders screens via Hiker APIs (`setResult`, `setHomeResult`, `$().rule()`, `.lazyRule()`); the only entrypoint loaded by the subscription.
  - `docs/subscription.json` — the **single** subscription manifest, one entry per app (Jable / MissAV / Hanime1), pointing at `<app>_pages.js` over HTTPS.
- Apps: `jable`, `missav`, `hanime`.

## Critical: version bump on every code change

Clients cache modules aggressively. When changing any app's code you MUST bump, together, everywhere:

1. that app's `version` field in `docs/subscription.json`
2. `MODULE_VERSION` at the top of `docs/apps/<app>/<app>_pages.js`
3. Every hardcoded `?v=N` literal — duplicated as string literals inside `$().rule()`/`lazyRule()` callbacks and in the subscription JSON's `find_rule`/`searchFind` strings (e.g. Jable has ~10 such literals). Grep the old value before committing; moving a file also means rewriting every full URL.

A missed `?v=` means devices silently keep running the stale module.

## Runtime environment (Hiker embedded JS engine)

- **ES5 only**: `var`, no arrow functions, no template literals, no `let/const`.
- UI strings and comments are Chinese; keep that style.
- Each file wraps in an IIFE and exports at the bottom: `module.exports = exported;` and `$.exports = exported;`.
- Rule callbacks run in an **isolated scope**: closures from the outer file are not visible. Re-`require` the module inside each callback and pass data via the explicit params argument.
- Available globals in-app (not in Node): `$`, `storage0`, `fetchPC`, `pdfa`, `pdfh`, `MY_URL`, `MY_PAGE`, `setResult`, `setHomeResult`, `setPageTitle`, `setPagePicUrl`, `refreshPage`.
- Module loader quirk: Jable uses `requirejs(url)` with fallback `$.require('hiker://files/rules/<app>/…')`; MissAV/Hanime use `$.require(url)` directly because empty-rule callbacks do not always expose `requirejs`.

## Gotchas

- Anti-bot detection lives in each core's usable-html check: rejects short bodies and Cloudflare/captcha markers. Always pass a content `marker` option — a page-specific marker outranks generic checks (MissAV embeds a passive CF detector in otherwise-valid pages; Hanime's live block page says "Attention Required", not "Just a moment").
- Pagination differs per site: Jable rewrites paths to `.../fypage/` plus `[firstPage=<url>]`; MissAV/Hanime rebuild a clean `page=N` query param from `MY_PAGE` — search URLs must not be embedded in the fypage token.
- Never `decodeURIComponent` raw `MY_URL` fragments without try/catch: Hiker native search injects unencoded keywords, so `%` throws URIError (use hanime_pages.js `decodeSafe` pattern).
- Hanime menus/filters mirror the live site: genre dropdown (`genre-option[data-value]`), sort panel (`#sort-wrapper .hentai-sort-options`), year/month selects, multi-select `tags[]`. Hanime needs manual web verification ("验证并同步" appears only when a request was actually blocked). The clearance is stored **paired with the UA it was issued for** (`hanime1.webSession`) and replayed verbatim — Cloudflare binds `cf_clearance` to UA+IP, so never send the desktop default UA alongside a mobile-webview session (that also loops the challenge inside X5 webviews; verify with `config.mobileUa`).
- Playback URLs handed to the player need headers (Referer/User-Agent) via the `{urls:[…], names:[…], headers:[…]}` JSON payload shape.

## Verifying changes

Run the dependency-free smoke tests:

```
node test/hanime.test.js
```

They stub the Hiker globals, execute real code paths, and assert cross-file version consistency for all three apps. Extend them when touching other apps.

After pushing to `main`, refresh `docs/subscription.json` in the Hiker app and exercise home → list → detail → playback on-device. Site HTML drifts often; failures usually mean selectors/markers need updating against the live page.

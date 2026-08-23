# AGENTS.md

## What this repo is

Static JavaScript rules ("mini-apps") for the Hiker (海阔视界) Android video app. There is **no build system, package.json, linter, test suite, or CI** — the repo root contains only `docs/`.

- `docs/` is served directly by **GitHub Pages** (`https://supermiee.github.io/haikuo-miniapps/`, `.nojekyll` present). Pushing to `main` publishes immediately.
- Three apps: `jable_*`, `missav_*`, `hanime_*`. Each has:
  - `<app>_core.js` — kernel: HTTP via `fetchPC` (multi-host failover), HTML parsing (regex + Hiker `pdfa`/`pdfh`), caching via `storage0`, diagnostics.
  - `<app>_pages.js` — page layer: renders screens via Hiker APIs (`setResult`, `setHomeResult`, `$().rule()`, `.lazyRule()`); the only entrypoint loaded by the JSON subscription.
  - Subscription entries in `*-subscription.json` (`jable-subscription.json` also holds the MissAV/Hanime entries) point at `<app>_pages.js` over HTTPS.

## Critical: version bump on every code change

Clients cache modules aggressively. When changing any app's code you MUST bump, together, everywhere:

1. `version` in the app's entry in `docs/*-subscription.json`
2. `MODULE_VERSION` at the top of that app's `<app>_pages.js`
3. Every hardcoded `?v=N` literal — these are duplicated as string literals inside `$().rule()`/`lazyRule()` callbacks and in the subscription JSON's `find_rule`/`searchFind` strings (e.g. `?v=20` appears 10× in `jable_pages.js`). Grep for the old value before committing.

A missed `?v=` means devices silently keep running the stale module.

## Runtime environment (Hiker embedded JS engine)

- **ES5 only**: `var`, no arrow functions, no template literals, no `let/const`.
- UI strings and comments are Chinese; keep that style.
- Each file wraps in an IIFE and exports at the bottom: `module.exports = exported;` and `$.exports = exported;`.
- Rule callbacks run in an **isolated scope**: closures from the outer file are not visible. Re-`require` the module inside each callback and pass data via the explicit params argument.
- Available globals in-app (not in Node): `$`, `storage0`, `fetchPC`, `pdfa`, `pdfh`, `MY_URL`, `MY_PAGE`, `setResult`, `setHomeResult`, `setPageTitle`, `setPagePicUrl`, `refreshPage`.
- Module loader quirk: Jable uses `requirejs(url)` with fallback `$.require('hiker://files/rules/<app>/…')`; MissAV/Hanime use `$.require(url)` directly because empty-rule callbacks do not always expose `requirejs`.

## Gotchas

- Anti-bot detection lives in each core's `isUsableHtml`: rejects short bodies and Cloudflare/captcha markers. Always pass a content `marker` option — a page-specific marker outranks generic checks (MissAV embeds a passive CF detector in otherwise-valid pages).
- Pagination differs per site: Jable rewrites paths to `.../fypage/` plus `[firstPage=<url>]`; MissAV ignores fypage-in-URL and rebuilds a clean `page=N` query param from `MY_PAGE` — search URLs must not be embedded in the fypage token.
- Hanime1 requires manual web verification; its "验证并同步" flow syncs cookies back into the app session.
- Playback URLs handed to the player need headers (Referer/User-Agent) via the `{urls:[…], names:[…], headers:[…]}` JSON payload shape.

## Verifying changes

Nothing runs automatically. After pushing to `main`, load/refresh the subscription JSON in the Hiker app and exercise home → list → detail → playback on-device. Site HTML drifts often; failures usually mean selectors/markers need updating against the live page.

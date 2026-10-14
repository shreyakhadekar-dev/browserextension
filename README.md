# Browser Extension Permission Risk Auditor

A full-stack implementation of the project described in *Review-I: Browser
Extension Permission Risk Auditor* (BCSE410L, Shivam Kaushik, 23BCE0058) -
a Chrome (Manifest V3) extension that scores every extension installed in
your browser, using declared permissions **and** observed network
behavior, and re-checks them over time so a silent permission increase
after an update actually gets noticed.

This repo implements every objective from Section 2.3 of the review doc:

| # | Objective | Where it's implemented |
|---|---|---|
| 1 | List installed extensions + permissions via the browser's own API | `extension/src/background.js` → `chrome.management.getAll()` |
| 2 | Weighted permission risk score | `server/src/scoring/weights.js` + `scoreEngine.js` |
| 3 | Runtime signal (network domains contacted) | `extension/src/background.js` (`chrome.webRequest`) |
| 4 | One Composite Risk Score + plain-language reason | `scoreEngine.js` → `scoreExtension()` |
| 5 | Periodic re-check to catch silent permission increases | `chrome.alarms` in `background.js`, `previous`/delta in `POST /api/scan` |

## Architecture

```
Chrome (Manifest V3)                     Express API                PostgreSQL
┌───────────────────────┐   POST /api/scan   ┌───────────────┐   ┌──────────────────────────┐
│ background.js          │ ─────────────────▶ │ scoreEngine.js │──▶│ extension_risk_history    │
│  chrome.management     │                     │ (weights.js)   │   │ (one row per scan)        │
│  chrome.webRequest     │ ◀───────────────── │               │◀──│                           │
│  chrome.alarms         │   GET /api/extensions              └──────────────────────────┘
└──────────┬─────────────┘
           │ chrome.storage.local (cache)
           ▼
┌───────────────────────┐
│ popup.html / options.html (React + Vite) │
│  ranked list · score breakdown · history charts │
└───────────────────────┘
```

This matches Section 6/7 of the review doc: React (Vite) frontend rendered
as the extension's popup/options page, a Node.js + Express API running the
scoring formula, and PostgreSQL storing `extension_risk_history`.

## Project layout

```
browser-extension-risk-auditor/
├── server/            Express API + PostgreSQL scoring backend
│   ├── src/
│   │   ├── scoring/   weights.js, scoreEngine.js (+ unit tests)
│   │   ├── routes/    scan.js, extensions.js, health.js
│   │   ├── db.js, migrate.js
│   │   └── db/schema.sql
│   └── package.json
├── extension/         Manifest V3 Chrome extension
│   ├── manifest.json
│   ├── src/background.js         service worker
│   ├── src/popup/                popup UI (React)
│   ├── src/options/               full dashboard (React)
│   ├── src/shared/                api client, design tokens, weight descriptions
│   └── vite.config.js
├── docker-compose.yml  optional local Postgres
└── README.md
```

## Running it

### 1. Database

Either run Postgres via Docker:

```bash
docker compose up -d
```

...or point `server/.env` at any existing PostgreSQL instance (see
`server/.env.example`).

### 2. Backend API

```bash
cd server
cp .env.example .env      # edit if your DB isn't the docker-compose default
npm install
npm run migrate           # creates extension_risk_history
npm run dev                # http://localhost:4000
```

Sanity check: `curl http://localhost:4000/api/health` should return
`{"status":"ok","db":"connected"}`.

Run the scoring-engine unit tests any time with `npm test` (they don't
need a database - pure functions in, JSON out).

### 3. Extension

```bash
cd extension
npm install
npm run build              # outputs to extension/dist
```

Then in Chrome:

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select `extension/dist`.
4. Click the extension's icon to open the popup, or right-click it →
   **Options** for the full dashboard.

The first install triggers an automatic scan a few seconds after load;
after that, use **Scan now** in the popup or **Rescan all** in the
dashboard, or wait for the built-in 6-hour periodic re-check
(`chrome.alarms`, Objective 5).

If your API isn't on `http://localhost:4000`, open the dashboard →
gear icon → set the **Backend API URL**.

## The scoring formula (Section 6, Step 3-5)

`server/src/scoring/weights.js` assigns each Chrome permission a weight
from 1 (low blast radius: `storage`, `alarms`) to 10 (critical: `debugger`,
`proxy`, `nativeMessaging`, `webRequestBlocking`), with the weights and
their justification tied directly to the papers in the literature survey
(Section 3) - see the comments at the top of that file for the mapping
from finding → weight tier.

- **Permission score (0-100):** sum of weights for declared `permissions`
  and the worst `host_permissions` pattern (an `<all_urls>` grant is
  capped so it can't be diluted by also listing narrower patterns, and a
  pile of narrow, specific-origin permissions can't out-score one
  `<all_urls>` either), normalized against a realistic "genuinely
  over-privileged extension" baseline.
- **Runtime adjustment (0-25):** +5 for every distinct domain the
  extension's own background context contacted that isn't on a short
  known-benign infra allowlist (`scoreEngine.js`), capped at 25 - grounded
  in Singh et al. (2025)'s finding that minimal declared permissions can
  still enable real data exfiltration, so this signal is additive, not a
  discount on the permission score.
- **Composite score:** `permissionScore + runtimeAdjustment`, clamped to
  0-100. Labeled **Low** (<40) / **Medium** (40-69) / **High** (≥70).

Every score, its full breakdown, and the domains observed at scan time
are written to `extension_risk_history` with a timestamp, so
`GET /api/extensions/:id/history` can show how a specific extension's
score moved after each update - the dashboard's line chart is a direct
answer to Objective 5 ("a permission review done once... doesn't catch a
scope increase that arrives in an update six months later").

## Known limitations (stated, not hidden)

- **Runtime attribution is best-effort.** `chrome.webRequest` can only
  reliably attribute a network request to an extension when that
  request's `initiator` is the extension's own background/service-worker
  context (`chrome-extension://<id>`). A request made by a content script
  injected into a normal page shows the *page's* origin as the initiator,
  not the extension's - there's no public WebExtension API that gives a
  third-party extension a fully general way to attribute that traffic.
  This is a real constraint of building on top of public browser APIs,
  and it's why the runtime signal is described as a "lightweight
  adjustment," not a full network audit, in the original proposal.
- **Service workers are non-persistent.** Manifest V3 background scripts
  can be suspended when idle, so `chrome.webRequest` observation only
  covers domains contacted while the service worker happens to be
  active. The periodic alarm and the declared-permission score (which
  doesn't depend on the worker being awake) are what make the tool useful
  even given this.
- **Chrome/Manifest V3 only**, per the scope in Section 2.2 of the review
  doc. Firefox/Edge support, mentioned there as a "natural later
  extension," would mean swapping `chrome.management`/`chrome.webRequest`
  for the WebExtensions equivalents in `background.js` - the scoring
  engine and API are already browser-agnostic.
- **The known-benign domain list is small and manual** (`scoreEngine.js`),
  intentionally - it exists so extremely common infrastructure doesn't
  drown out genuinely novel domains, not as a serious allowlist/reputation
  system. A production version would want a real domain-reputation source
  instead of a hardcoded list.

## Suggested next steps (beyond this review)

Matches the "later reviews" framing in Section 8 of the proposal:

- Package the extension for the Chrome Web Store (currently loaded
  unpacked for development, per Section 7's deployment row).
- Add authentication so `extension_risk_history` can be scoped per user
  if this ever runs against more than one person's browser.
- Replace the static known-benign domain list with a real reputation
  lookup.
- Firefox/Edge builds via `webextension-polyfill`.

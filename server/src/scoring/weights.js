/**
 * Permission risk weights.
 *
 * These are not arbitrary point values. Each tier is grounded in a specific
 * finding from the literature survey (Section 3 of the Review-I document):
 *
 *  - CRITICAL: broad host access (<all_urls> / all http(s) sites), webRequest,
 *    management and debugger repeatedly show up as the permissions that turn
 *    into real exploits in Kim & Lee (2023) (UXSS / credential theft via
 *    over-privileged extensions) and in Eriksson et al. (2022)'s static
 *    analysis of "sensitive information an extension can access".
 *  - HIGH: permissions that let an extension read or intercept a lot of a
 *    user's activity even without full host access (history, cookies,
 *    downloads, proxy, nativeMessaging) - the kind of access Nayak et al.
 *    (2024) found 28K+ Web Store extensions holding to "sensitive page
 *    fields".
 *  - MEDIUM: permissions that are commonly abused but only dangerous in
 *    combination with something else (tabs, scripting, clipboard, identity).
 *    Singh et al. (2025) specifically show that a *minimal* set - activeTab,
 *    scripting, storage - was enough for real extensions to exfiltrate data,
 *    which is why these are not scored as "low" just because they look
 *    narrow on paper.
 *  - LOW: permissions with a small, well-scoped blast radius (alarms,
 *    idle, contextMenus, fontSettings, notifications).
 *
 * Anything not in this table falls back to DEFAULT_PERMISSION_WEIGHT so a
 * new/unrecognized Chrome permission doesn't silently score as 0.
 */

export const PERMISSION_WEIGHTS = Object.freeze({
  // ---- CRITICAL (10) --------------------------------------------------
  debugger: 10,
  proxy: 10,
  nativeMessaging: 10,
  webRequestBlocking: 10,
  management: 9,
  webRequest: 9,
  declarativeNetRequest: 8,
  declarativeNetRequestWithHostAccess: 9,

  // ---- HIGH (6-8) -------------------------------------------------------
  downloads: 7,
  "downloads.open": 8,
  history: 7,
  cookies: 7,
  browsingData: 7,
  privacy: 7,
  webNavigation: 6,
  webAuthenticationProxy: 8,
  certificateProvider: 8,
  vpnProvider: 9,

  // ---- MEDIUM (3-5) -------------------------------------------------------
  scripting: 5,
  tabs: 5,
  activeTab: 4,
  clipboardRead: 5,
  clipboardWrite: 3,
  geolocation: 5,
  identity: 5,
  "identity.email": 4,
  bookmarks: 3,
  topSites: 4,
  sessions: 4,
  background: 3,
  offscreen: 3,
  pageCapture: 5,
  tabCapture: 6,
  desktopCapture: 7,
  notifications: 3,

  // ---- LOW (1-2) -------------------------------------------------------
  storage: 1,
  unlimitedStorage: 1,
  alarms: 1,
  idle: 1,
  contextMenus: 1,
  fontSettings: 2,
  power: 1,
  "system.cpu": 1,
  "system.display": 1,
  "system.memory": 1,
  "system.storage": 1,
  printerProvider: 2,
  gcm: 2,
});

export const DEFAULT_PERMISSION_WEIGHT = 3; // unknown/new permission: treat as medium, not zero

/**
 * Host permission weighting is separate from the named-permission table
 * above because a single pattern like "<all_urls>" is far more dangerous
 * than the same weight applied per string.
 */
export const HOST_PERMISSION_WEIGHTS = Object.freeze({
  ALL_URLS: 10, // <all_urls>, *://*/*, or the union of http(s)://*/* covers everything
  ALL_HTTP_HTTPS: 9, // http://*/* AND https://*/* explicitly listed together
  BROAD_WILDCARD: 5, // e.g. *://*.google.com/* - a wide subdomain wildcard on one registrable domain
  SPECIFIC_ORIGIN: 0.5, // e.g. https://api.example.com/* - one concrete origin
});

// Weights above are intentionally tunable in one place. Changing a number
// here changes every future score; it does not retroactively rewrite
// extension_risk_history rows, which is what makes the history table useful
// for "did this get riskier" comparisons even if the rubric is refined later.

/** Raw score a maximally over-privileged extension would rack up under this
 *  rubric. Used to normalize permissionScore onto a 0-100 scale. Computed
 *  once, from a realistic "worst case" combination rather than the literal
 *  sum of every table entry (which would make normal high-risk extensions
 *  score unrealistically low). */
export const PERMISSION_SCORE_NORMALIZER = 46;
// == ALL_URLS (10) + webRequest (9) + management (9) + downloads (7)
//    + history (7) + tabs (5) -ish combination of what a genuinely
//    dangerous, broadly-scoped extension tends to request together.

export const RUNTIME_ADJUSTMENT_CAP = 25;
export const UNFAMILIAR_DOMAIN_POINTS = 5; // points added per unfamiliar domain, before the cap

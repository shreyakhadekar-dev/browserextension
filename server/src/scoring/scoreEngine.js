import {
  PERMISSION_WEIGHTS,
  DEFAULT_PERMISSION_WEIGHT,
  HOST_PERMISSION_WEIGHTS,
  PERMISSION_SCORE_NORMALIZER,
  RUNTIME_ADJUSTMENT_CAP,
  UNFAMILIAR_DOMAIN_POINTS,
} from "./weights.js";

/**
 * Domains that show up constantly in legitimate extension traffic
 * (update pings, telemetry the user has already agreed to, common
 * infra). Contacting one of these does NOT count as "unfamiliar" for the
 * runtime adjustment. This is intentionally short and conservative -
 * the point of Objective 3 is to flag domains a reviewer would want to
 * see, not to whitelist away the runtime signal entirely.
 */
export const KNOWN_BENIGN_DOMAIN_SUFFIXES = Object.freeze([
  "google.com",
  "googleapis.com",
  "gstatic.com",
  "googleusercontent.com",
  "gvt1.com",
  "microsoft.com",
  "msftconnecttest.com",
  "mozilla.org",
  "cloudflare.com",
  "jsdelivr.net",
  "unpkg.com",
  "github.com",
  "githubusercontent.com",
]);

function hostnameMatchesSuffix(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function isKnownBenignDomain(hostname) {
  const h = hostname.toLowerCase();
  return KNOWN_BENIGN_DOMAIN_SUFFIXES.some((suffix) => hostnameMatchesSuffix(h, suffix));
}

/** Classify a single host_permissions entry into one of the buckets in
 * HOST_PERMISSION_WEIGHTS. Chrome host permission patterns look like
 * <all_urls>, a wildcard scheme+host+path, https all-sites, a wildcard
 * subdomain on one site, or one concrete origin path. */
export function classifyHostPermission(pattern) {
  if (!pattern) return null;
  const p = pattern.trim();

  if (p === "<all_urls>" || p === "*://*/*") {
    return { bucket: "ALL_URLS", weight: HOST_PERMISSION_WEIGHTS.ALL_URLS };
  }
  if (p === "http://*/*" || p === "https://*/*") {
    return { bucket: "ALL_HTTP_HTTPS", weight: HOST_PERMISSION_WEIGHTS.ALL_HTTP_HTTPS };
  }

  // Pattern shape: <scheme>://<host>/<path>
  const match = p.match(/^[a-z*]+:\/\/([^/]+)\/.*$/i);
  if (!match) return { bucket: "SPECIFIC_ORIGIN", weight: HOST_PERMISSION_WEIGHTS.SPECIFIC_ORIGIN };

  const host = match[1];
  if (host === "*") {
    return { bucket: "ALL_URLS", weight: HOST_PERMISSION_WEIGHTS.ALL_URLS };
  }
  if (host.startsWith("*.")) {
    return { bucket: "BROAD_WILDCARD", weight: HOST_PERMISSION_WEIGHTS.BROAD_WILDCARD };
  }
  return { bucket: "SPECIFIC_ORIGIN", weight: HOST_PERMISSION_WEIGHTS.SPECIFIC_ORIGIN };
}

/**
 * Compute the declared-permission component of the score (Objective 2).
 * Returns { score (0-100), breakdown } where breakdown lists every
 * permission/host-pattern that contributed, so the UI can show *why*.
 */
export function computePermissionScore(permissions = [], hostPermissions = []) {
  const breakdown = [];
  let raw = 0;

  for (const perm of permissions) {
    const weight = Object.prototype.hasOwnProperty.call(PERMISSION_WEIGHTS, perm)
      ? PERMISSION_WEIGHTS[perm]
      : DEFAULT_PERMISSION_WEIGHT;
    raw += weight;
    breakdown.push({ type: "permission", key: perm, weight });
  }

  // Host permissions: dedupe by bucket severity so five unrelated
  // "*.example-N.com" wildcards don't stack up to more than one <all_urls>.
  let worstHostBucket = null;
  const specificOrigins = [];
  for (const pattern of hostPermissions) {
    const classified = classifyHostPermission(pattern);
    if (!classified) continue;
    if (classified.bucket === "SPECIFIC_ORIGIN") {
      specificOrigins.push(pattern);
      continue;
    }
    if (!worstHostBucket || classified.weight > worstHostBucket.weight) {
      worstHostBucket = { ...classified, pattern };
    }
  }
  if (worstHostBucket) {
    raw += worstHostBucket.weight;
    breakdown.push({
      type: "host_permission",
      key: worstHostBucket.pattern,
      weight: worstHostBucket.weight,
    });
  }
  // Specific origins are low-severity individually; count a capped, damped
  // contribution so 20 narrow origins still can't out-score one <all_urls>.
  if (specificOrigins.length > 0) {
    const capped = Math.min(specificOrigins.length, 6);
    const weight = capped * HOST_PERMISSION_WEIGHTS.SPECIFIC_ORIGIN;
    raw += weight;
    breakdown.push({
      type: "host_permission_group",
      key: `${specificOrigins.length} specific site permission(s)`,
      weight,
    });
  }

  const score = Math.max(0, Math.min(100, Math.round((raw / PERMISSION_SCORE_NORMALIZER) * 100)));
  breakdown.sort((a, b) => b.weight - a.weight);
  return { score, breakdown, raw };
}

/**
 * Compute the runtime-behavior adjustment (Objective 3), grounded in
 * Singh et al. (2025): declared permissions alone under-predict risk, so
 * contact with a domain outside the "known benign" set nudges the score up.
 */
export function computeRuntimeAdjustment(observedDomains = []) {
  const unique = [...new Set(observedDomains.map((d) => d.toLowerCase()))];
  const unfamiliar = unique.filter((d) => !isKnownBenignDomain(d));

  const adjustment = Math.min(RUNTIME_ADJUSTMENT_CAP, unfamiliar.length * UNFAMILIAR_DOMAIN_POINTS);
  return { adjustment, unfamiliarDomains: unfamiliar, observedDomainCount: unique.length };
}

export function labelForScore(score) {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function describeTopPermissions(breakdown, max = 2) {
  return breakdown
    .filter((b) => b.type !== "host_permission_group")
    .slice(0, max)
    .map((b) => PERMISSION_DESCRIPTIONS[b.key] || b.key);
}

// Short, plain-language phrases for the permissions/patterns most likely to
// end up in the "top reasons" list. Falls back to the raw key if absent.
const PERMISSION_DESCRIPTIONS = {
  "<all_urls>": "can read and change data on every website you visit",
  "*://*/*": "can read and change data on every website you visit",
  "http://*/*": "can read and change data on every website you visit",
  "https://*/*": "can read and change data on every website you visit",
  webRequest: "can inspect your network traffic",
  webRequestBlocking: "can inspect and modify your network traffic",
  management: "can enable, disable, or remove your other extensions",
  debugger: "can attach a debugger to your open tabs",
  proxy: "can control how your traffic is routed",
  nativeMessaging: "can talk to a program installed outside the browser",
  downloads: "can see and manage your downloads",
  history: "can read your browsing history",
  cookies: "can read your cookies (often including login sessions)",
  tabs: "can see the URLs and titles of your open tabs",
  scripting: "can inject and run scripts on pages you visit",
  activeTab: "can access the page you're currently viewing",
  clipboardRead: "can read your clipboard",
  geolocation: "can access your physical location",
  declarativeNetRequestWithHostAccess: "can block or redirect requests on sites it can access",
};

/**
 * Combine both signals into the Composite Risk Score (Objective 4) with a
 * plain-language reason, e.g. "High - requests access to all websites and
 * contacted an unfamiliar domain."
 */
export function buildReasons({ permissionScore, breakdown, runtimeAdjustment, unfamiliarDomains }) {
  const reasons = [];
  const topPerms = describeTopPermissions(breakdown, 2);
  reasons.push(...topPerms);

  if (unfamiliarDomains.length === 1) {
    reasons.push(`contacted an unfamiliar domain (${unfamiliarDomains[0]})`);
  } else if (unfamiliarDomains.length > 1) {
    reasons.push(
      `contacted ${unfamiliarDomains.length} previously-unseen domains, including ${unfamiliarDomains[0]}`
    );
  }

  if (reasons.length === 0) {
    reasons.push("requests only narrow, low-impact permissions and no unusual network activity was observed");
  }

  return reasons;
}

/**
 * Score one extension. `input` matches the payload the extension's
 * background service worker POSTs to /api/scan for a single extension.
 */
export function scoreExtension(input) {
  const { permissions = [], hostPermissions = [], observedDomains = [] } = input;

  const { score: permissionScore, breakdown } = computePermissionScore(permissions, hostPermissions);
  const { adjustment: runtimeAdjustment, unfamiliarDomains, observedDomainCount } =
    computeRuntimeAdjustment(observedDomains);

  // The permission score is the primary driver (Objective 2); the runtime
  // adjustment is additive on top of it, never damping it down, because a
  // genuinely over-privileged extension should read as High on declared
  // permissions alone (Objective 4: runtime is a *nudge*, not a discount).
  const compositeScore = Math.max(0, Math.min(100, Math.round(permissionScore + runtimeAdjustment)));
  const riskLabel = labelForScore(compositeScore);
  const reasons = buildReasons({ permissionScore, breakdown, runtimeAdjustment, unfamiliarDomains });

  return {
    permissionScore,
    runtimeAdjustment,
    compositeScore,
    riskLabel,
    reasons,
    scoreBreakdown: breakdown,
    unfamiliarDomains,
    observedDomainCount,
  };
}

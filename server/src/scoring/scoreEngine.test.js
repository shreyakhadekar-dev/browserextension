import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreExtension,
  computePermissionScore,
  computeRuntimeAdjustment,
  classifyHostPermission,
  labelForScore,
  isKnownBenignDomain,
} from "./scoreEngine.js";

test("a narrow, low-permission extension scores Low", () => {
  const result = scoreExtension({
    permissions: ["storage", "alarms"],
    hostPermissions: [],
    observedDomains: ["googleapis.com"],
  });
  assert.equal(result.riskLabel, "Low");
  assert.ok(result.compositeScore < 40, `expected < 40, got ${result.compositeScore}`);
});

test("<all_urls> + webRequest + management scores High", () => {
  const result = scoreExtension({
    permissions: ["webRequest", "management", "downloads"],
    hostPermissions: ["<all_urls>"],
    observedDomains: [],
  });
  assert.equal(result.riskLabel, "High");
  assert.ok(result.compositeScore >= 70, `expected >= 70, got ${result.compositeScore}`);
});

test("minimal permissions + unfamiliar domain contact still gets flagged (Singh et al. 2025 case)", () => {
  const minimal = scoreExtension({
    permissions: ["activeTab", "scripting", "storage"],
    hostPermissions: [],
    observedDomains: [],
  });
  const sameWithExfil = scoreExtension({
    permissions: ["activeTab", "scripting", "storage"],
    hostPermissions: [],
    observedDomains: ["totally-unfamiliar-tracker.example"],
  });
  assert.ok(
    sameWithExfil.compositeScore > minimal.compositeScore,
    "runtime signal should raise the score even when declared permissions are minimal"
  );
  assert.equal(sameWithExfil.unfamiliarDomains.length, 1);
});

test("known benign infra domains are not flagged as unfamiliar", () => {
  assert.equal(isKnownBenignDomain("www.googleapis.com"), true);
  assert.equal(isKnownBenignDomain("update.googleapis.com"), true);
  assert.equal(isKnownBenignDomain("evil-tracker.ru"), false);
});

test("host permission classification", () => {
  assert.equal(classifyHostPermission("<all_urls>").bucket, "ALL_URLS");
  assert.equal(classifyHostPermission("https://*/*").bucket, "ALL_HTTP_HTTPS");
  assert.equal(classifyHostPermission("*://*.example.com/*").bucket, "BROAD_WILDCARD");
  assert.equal(classifyHostPermission("https://api.example.com/*").bucket, "SPECIFIC_ORIGIN");
});

test("many narrow host permissions cannot out-score one <all_urls>", () => {
  const broad = computePermissionScore([], ["<all_urls>"]);
  const manyNarrow = computePermissionScore(
    [],
    Array.from({ length: 20 }, (_, i) => `https://site${i}.example.com/*`)
  );
  assert.ok(broad.score > manyNarrow.score);
});

test("runtime adjustment is capped", () => {
  const domains = Array.from({ length: 50 }, (_, i) => `unfamiliar-${i}.example`);
  const { adjustment } = computeRuntimeAdjustment(domains);
  assert.ok(adjustment <= 25);
});

test("labelForScore boundaries", () => {
  assert.equal(labelForScore(0), "Low");
  assert.equal(labelForScore(39), "Low");
  assert.equal(labelForScore(40), "Medium");
  assert.equal(labelForScore(69), "Medium");
  assert.equal(labelForScore(70), "High");
  assert.equal(labelForScore(100), "High");
});

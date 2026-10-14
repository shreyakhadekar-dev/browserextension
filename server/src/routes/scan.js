import { Router } from "express";
import { pool } from "../db.js";
import { scoreExtension } from "../scoring/scoreEngine.js";

const router = Router();

/** Basic shape validation for one extension entry in the scan payload. */
function validateExtension(ext, index) {
  const errors = [];
  if (!ext || typeof ext !== "object") {
    return [`extensions[${index}] must be an object`];
  }
  if (typeof ext.id !== "string" || !ext.id) errors.push(`extensions[${index}].id is required`);
  if (typeof ext.name !== "string" || !ext.name) errors.push(`extensions[${index}].name is required`);
  if (ext.permissions && !Array.isArray(ext.permissions)) errors.push(`extensions[${index}].permissions must be an array`);
  if (ext.hostPermissions && !Array.isArray(ext.hostPermissions)) errors.push(`extensions[${index}].hostPermissions must be an array`);
  if (ext.observedDomains && !Array.isArray(ext.observedDomains)) errors.push(`extensions[${index}].observedDomains must be an array`);
  return errors;
}

router.post("/", async (req, res) => {
  const { extensions } = req.body || {};

  if (!Array.isArray(extensions) || extensions.length === 0) {
    return res.status(400).json({ error: "Request body must include a non-empty 'extensions' array." });
  }

  const validationErrors = extensions.flatMap(validateExtension);
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: "Invalid payload", details: validationErrors });
  }

  const client = await pool.connect();
  const results = [];

  try {
    await client.query("BEGIN");

    for (const ext of extensions) {
      const permissions = ext.permissions || [];
      const hostPermissions = ext.hostPermissions || [];
      const observedDomains = ext.observedDomains || [];

      const scored = scoreExtension({ permissions, hostPermissions, observedDomains });

      // Look up the most recent previous score for this extension so the
      // UI can show "up 12 points since last check" (Objective 5).
      const prevResult = await client.query(
        `SELECT composite_score, risk_label, checked_at
         FROM extension_risk_history
         WHERE extension_id = $1
         ORDER BY checked_at DESC
         LIMIT 1`,
        [ext.id]
      );
      const previous = prevResult.rows[0] || null;

      const insertResult = await client.query(
        `INSERT INTO extension_risk_history
           (extension_id, name, version, install_type, enabled,
            permissions, host_permissions, observed_domains, unfamiliar_domains,
            permission_score, runtime_adjustment, composite_score, risk_label,
            reasons, score_breakdown)
         VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13, $14,$15)
         RETURNING id, checked_at`,
        [
          ext.id,
          ext.name,
          ext.version || null,
          ext.installType || "normal",
          ext.enabled !== false,
          JSON.stringify(permissions),
          JSON.stringify(hostPermissions),
          JSON.stringify(observedDomains),
          JSON.stringify(scored.unfamiliarDomains),
          scored.permissionScore,
          scored.runtimeAdjustment,
          scored.compositeScore,
          scored.riskLabel,
          JSON.stringify(scored.reasons),
          JSON.stringify(scored.scoreBreakdown),
        ]
      );

      results.push({
        extensionId: ext.id,
        name: ext.name,
        version: ext.version || null,
        enabled: ext.enabled !== false,
        permissionScore: scored.permissionScore,
        runtimeAdjustment: scored.runtimeAdjustment,
        compositeScore: scored.compositeScore,
        riskLabel: scored.riskLabel,
        reasons: scored.reasons,
        scoreBreakdown: scored.scoreBreakdown,
        unfamiliarDomains: scored.unfamiliarDomains,
        observedDomainCount: scored.observedDomainCount,
        checkedAt: insertResult.rows[0].checked_at,
        previous: previous
          ? {
              compositeScore: Number(previous.composite_score),
              riskLabel: previous.risk_label,
              checkedAt: previous.checked_at,
              delta: scored.compositeScore - Number(previous.composite_score),
            }
          : null,
      });
    }

    await client.query("COMMIT");
    res.status(201).json({ scannedAt: new Date().toISOString(), results });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Scan failed:", err);
    res.status(500).json({ error: "Failed to score and store scan results.", details: err.message });
  } finally {
    client.release();
  }
});

export default router;

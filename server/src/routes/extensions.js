import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

function serializeRow(row) {
  return {
    extensionId: row.extension_id,
    name: row.name,
    version: row.version,
    installType: row.install_type,
    enabled: row.enabled,
    permissions: row.permissions,
    hostPermissions: row.host_permissions,
    observedDomains: row.observed_domains,
    unfamiliarDomains: row.unfamiliar_domains,
    permissionScore: Number(row.permission_score),
    runtimeAdjustment: Number(row.runtime_adjustment),
    compositeScore: Number(row.composite_score),
    riskLabel: row.risk_label,
    reasons: row.reasons,
    scoreBreakdown: row.score_breakdown,
    checkedAt: row.checked_at,
  };
}

/** GET /api/extensions - latest score per extension, ranked by risk. */
router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (extension_id) *
       FROM extension_risk_history
       ORDER BY extension_id, checked_at DESC`
    );
    const rows = result.rows.map(serializeRow).sort((a, b) => b.compositeScore - a.compositeScore);
    res.json({ extensions: rows, count: rows.length });
  } catch (err) {
    console.error("Failed to list extensions:", err);
    res.status(500).json({ error: "Failed to load extension scores.", details: err.message });
  }
});

/** GET /api/extensions/:id/history - every scan of one extension, oldest first. */
router.get("/:id/history", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM extension_risk_history WHERE extension_id = $1 ORDER BY checked_at ASC`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No history found for this extension id." });
    }
    res.json({ extensionId: req.params.id, history: result.rows.map(serializeRow) });
  } catch (err) {
    console.error("Failed to load history:", err);
    res.status(500).json({ error: "Failed to load extension history.", details: err.message });
  }
});

export default router;

import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "degraded", db: "unreachable", error: err.message });
  }
});

export default router;

import { Router } from "express";
import crypto from "node:crypto";
import { pool } from "../db.js";

const router = Router();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, key] = stored.split(":");
    const hashed = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hashed, "hex"), Buffer.from(key, "hex"));
  } catch {
    return false;
  }
}

// Generate simple signed session token
const SECRET = process.env.JWT_SECRET || "sentinel-extension-risk-secret-key-410";

function createToken(user) {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role, exp: Date.now() + 86400000 * 7 })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [payload, signature] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
    if (signature !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// Ensure demo user exists
async function ensureDemoUser() {
  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", ["analyst@sentinel.sec"]);
    if (existing.rows.length === 0) {
      const hash = hashPassword("Password123!");
      await pool.query(
        "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)",
        ["Alex Vance", "analyst@sentinel.sec", hash, "Lead Security Auditor"]
      );
    }
  } catch (err) {
    // If table isn't migrated yet, it will retry on next call
  }
}

ensureDemoUser();

/** POST /api/auth/register */
router.post("/register", async (req, res) => {
  const { name, email, password, role = "Security Analyst" } = req.body || {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "Name must be at least 2 characters." });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email address is required." });
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const hashed = hashPassword(password);
    const result = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at",
      [name.trim(), email.toLowerCase().trim(), hashed, role]
    );

    const user = result.rows[0];
    const token = createToken(user);
    res.status(201).json({
      message: "Account created successfully.",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to create account.", details: err.message });
  }
});

/** POST /api/auth/login */
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];
    const valid = verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = createToken(user);
    res.json({
      message: "Logged in successfully.",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed.", details: err.message });
  }
});

/** GET /api/auth/me */
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header." });
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  try {
    const result = await pool.query("SELECT id, name, email, role, created_at FROM users WHERE id = $1", [decoded.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user profile." });
  }
});

export default router;

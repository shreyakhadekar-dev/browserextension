import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let activePool = null;
let initPromise = null;

function createSQLiteBackend() {
  const dataDir = path.resolve(__dirname, "../data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "auditor.sqlite");
  const sqlite = new DatabaseSync(dbPath);

  // Initialize tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS extension_risk_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extension_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT,
      install_type TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      permissions TEXT NOT NULL DEFAULT '[]',
      host_permissions TEXT NOT NULL DEFAULT '[]',
      observed_domains TEXT NOT NULL DEFAULT '[]',
      unfamiliar_domains TEXT NOT NULL DEFAULT '[]',
      permission_score REAL NOT NULL,
      runtime_adjustment REAL NOT NULL DEFAULT 0,
      composite_score REAL NOT NULL,
      risk_label TEXT NOT NULL,
      reasons TEXT NOT NULL DEFAULT '[]',
      score_breakdown TEXT NOT NULL DEFAULT '[]',
      checked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Security Analyst',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_erh_extension_id_checked_at
      ON extension_risk_history (extension_id, checked_at DESC);

    CREATE INDEX IF NOT EXISTS idx_users_email
      ON users (email);
  `);

  console.log("Ultra-lightweight embedded SQLite database initialized at:", dbPath);

  function executeQuery(text, params = []) {
    let sql = text.trim();

    // Remove any trailing semicolons inside subqueries if present
    if (sql.endsWith(";")) sql = sql.slice(0, -1).trim();

    // Map DISTINCT ON to SQLite window function
    if (sql.includes("DISTINCT ON (extension_id)")) {
      sql = `
        SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY extension_id ORDER BY checked_at DESC) as rn
          FROM extension_risk_history
        ) WHERE rn = 1
      `;
    }

    // Replace PostgreSQL $1, $2, ... placeholders with SQLite ?
    sql = sql.replace(/\$\d+/g, "?");

    // Handle transaction control commands
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      sqlite.exec(sql);
      return { rows: [] };
    }

    // Health check query
    if (sql === "SELECT 1" || sql.startsWith("SELECT 1")) {
      return { rows: [{ "?column?": 1 }] };
    }

    // Prepare statement and execute
    const stmt = sqlite.prepare(sql);
    let rows;
    if (sql.startsWith("SELECT") || sql.includes("RETURNING")) {
      rows = stmt.all(...params);
    } else {
      const res = stmt.run(...params);
      rows = [{ id: res.lastInsertRowid }];
    }

    // Parse JSON columns back to objects/arrays
    const jsonCols = ["permissions", "host_permissions", "observed_domains", "unfamiliar_domains", "reasons", "score_breakdown"];
    const normalizedRows = rows.map((r) => {
      const obj = { ...r };
      for (const col of jsonCols) {
        if (typeof obj[col] === "string") {
          try {
            obj[col] = JSON.parse(obj[col]);
          } catch {}
        }
      }
      return obj;
    });

    return { rows: normalizedRows };
  }

  return {
    async query(text, params) {
      return executeQuery(text, params);
    },
    async connect() {
      return {
        query: async (text, params) => executeQuery(text, params),
        release: () => {},
      };
    },
    on() {},
    async end() {
      sqlite.close();
    },
  };
}

async function getBackend() {
  if (activePool) return activePool;
  if (!initPromise) {
    initPromise = (async () => {
      if (process.env.USE_EMBEDDED_DB === "true" || !process.env.DATABASE_URL) {
        activePool = createSQLiteBackend();
        return activePool;
      }

      const connectionConfig = {
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 3000,
      };

      const pgPool = new Pool(connectionConfig);
      try {
        const client = await pgPool.connect();
        client.release();
        console.log("Connected to external PostgreSQL database.");
        pgPool.on("error", (err) => {
          console.error("Unexpected PostgreSQL client error", err);
        });
        activePool = pgPool;
        return activePool;
      } catch (err) {
        console.log(`External PostgreSQL unavailable (${err.message}). Using embedded SQLite database.`);
        await pgPool.end().catch(() => {});
        activePool = createSQLiteBackend();
        return activePool;
      }
    })();
  }
  return initPromise;
}

export const pool = {
  async query(...args) {
    const backend = await getBackend();
    return backend.query(...args);
  },
  async connect() {
    const backend = await getBackend();
    return backend.connect();
  },
  on(event, handler) {
    getBackend().then((b) => b.on && b.on(event, handler));
  },
  async end() {
    if (activePool) {
      await activePool.end();
      activePool = null;
    }
  },
};

export async function query(text, params) {
  return pool.query(text, params);
}

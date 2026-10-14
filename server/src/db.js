import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let activePool = null;
let initPromise = null;

async function createPGliteBackend() {
  const dataDir = path.resolve(__dirname, "../data/pgdata");
  fs.mkdirSync(dataDir, { recursive: true });
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;

  const schemaPath = path.join(__dirname, "db", "schema.sql");
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, "utf8");
    await pglite.exec(schema);
    console.log("Embedded PGlite database initialized with schema at:", dataDir);
  }

  return {
    async query(text, params) {
      if (!params || params.length === 0) {
        try {
          return await pglite.query(text, params);
        } catch (e) {
          if (e.message && e.message.includes("cannot insert multiple commands")) {
            const results = await pglite.exec(text);
            return results && results.length ? results[results.length - 1] : { rows: [] };
          }
          throw e;
        }
      }
      return pglite.query(text, params);
    },
    async connect() {
      return {
        query: async (text, params) => {
          if (!params || params.length === 0) {
            try {
              return await pglite.query(text, params);
            } catch (e) {
              if (e.message && e.message.includes("cannot insert multiple commands")) {
                const results = await pglite.exec(text);
                return results && results.length ? results[results.length - 1] : { rows: [] };
              }
              throw e;
            }
          }
          return pglite.query(text, params);
        },
        release: () => {},
      };
    },
    on(event, handler) {},
    async end() {
      await pglite.close();
    },
  };
}

async function getBackend() {
  if (activePool) return activePool;
  if (!initPromise) {
    initPromise = (async () => {
      if (process.env.USE_EMBEDDED_DB === "true") {
        activePool = await createPGliteBackend();
        return activePool;
      }

      const connectionConfig = process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 }
        : {
            host: process.env.PGHOST || "localhost",
            port: Number(process.env.PGPORT) || 5432,
            user: process.env.PGUSER || "auditor",
            password: process.env.PGPASSWORD || "auditor",
            database: process.env.PGDATABASE || "extension_risk_auditor",
            connectionTimeoutMillis: 2000,
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
        console.log(`External PostgreSQL not available (${err.message}). Using embedded PGlite database.`);
        await pgPool.end().catch(() => {});
        activePool = await createPGliteBackend();
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


import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const schemaPath = join(__dirname, "db", "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");

  console.log("Applying schema from", schemaPath);
  await pool.query(schema);
  console.log("Migration complete: extension_risk_history is ready.");
  await pool.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

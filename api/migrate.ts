import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";

const url = process.env["TURSO_DATABASE_URL"];
const authToken = process.env["TURSO_AUTH_TOKEN"];

if (!url || !authToken) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
}

const client = createClient({ url, authToken, intMode: "number" });

try {
  const migrationColumns = await client.execute("PRAGMA table_info(schema_migrations)");
  if (migrationColumns.rows.length > 0) {
    const columns = migrationColumns.rows.map((row) => row.name);
    if (!columns.includes("name")) {
      throw new Error(
        "This Turso database has an incompatible migration history; use a dedicated database",
      );
    }
  } else {
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    if (tables.rows.length > 0) {
      throw new Error("This Turso database is not empty; use a dedicated database for Coin Rush");
    }
    await client.execute(`CREATE TABLE schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  const migrationName = "0001_init";
  const applied = await client.execute({
    sql: "SELECT name FROM schema_migrations WHERE name = ?",
    args: [migrationName],
  });

  if (applied.rows.length === 0) {
    const migration = await readFile(
      new URL("./migrations/0001_init.sql", import.meta.url),
      "utf8",
    );
    await client.executeMultiple(migration);
    await client.execute({
      sql: "INSERT INTO schema_migrations (name) VALUES (?)",
      args: [migrationName],
    });
    console.info(`Applied ${migrationName}`);
  } else {
    console.info(`${migrationName} already applied`);
  }
} finally {
  client.close();
}

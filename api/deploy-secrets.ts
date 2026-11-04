import { spawn } from "node:child_process";

const requiredSecrets = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "TELEGRAM_BOT_TOKEN"];
const missing = requiredSecrets.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(`Missing Worker secret(s): ${missing.join(", ")}`);
}

for (const name of requiredSecrets) {
  const value = process.env[name]!;
  const child = spawn(
    "bun",
    ["run", "wrangler", "secret", "put", name, "--config", "api/wrangler.jsonc"],
    { stdio: ["pipe", "ignore", "ignore"], env: process.env },
  );
  child.stdin.end(value);

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0) throw new Error(`Failed to upload Worker secret ${name}`);
}

console.info("Uploaded Worker secrets");

export {};

const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
const apiToken = process.env["CLOUDFLARE_API_TOKEN"];

if (!accountId || !apiToken) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues`;
const headers = {
  authorization: `Bearer ${apiToken}`,
  "content-type": "application/json",
};

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    result?: Array<{ queue_name?: string }> | { queue_name?: string };
  };
  if (!response.ok || payload.success === false)
    throw new Error("Cloudflare Queue provisioning failed");
  return payload;
}

const existing = await request(endpoint);
const knownNames = new Set(
  Array.isArray(existing.result) ? existing.result.map((queue) => queue.queue_name) : [],
);

for (const queueName of ["coin-rush-payouts-dlq", "coin-rush-payouts"]) {
  if (knownNames.has(queueName)) continue;
  await request(endpoint, {
    method: "POST",
    body: JSON.stringify({ queue_name: queueName }),
  });
}

console.info("Cloudflare payout queues are ready");

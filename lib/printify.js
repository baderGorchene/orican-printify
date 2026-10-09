// Shared Printify client. The token is read from the PRINTIFY_TOKEN environment variable
// set in Vercel; it is never sent to the browser.
const BASE = "https://api.printify.com/v1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function printify(path, { method = "GET", body, pace = 0 } = {}) {
  const token = process.env.PRINTIFY_TOKEN;
  if (!token) throw new Error("PRINTIFY_TOKEN is not set in this Vercel environment");
  if (pace) await sleep(pace); // catalog endpoints: 100 requests per minute
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "ORICAN",
      "Content-Type": "application/json;charset=utf-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Printify ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Simple shared-secret check for admin-only endpoints (?key=... or x-admin-key header)
function isAdmin(req) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false;
  const given = req.headers["x-admin-key"] || new URL(req.url, "http://x").searchParams.get("key");
  return given === expected;
}

module.exports = { printify, isAdmin, sleep };

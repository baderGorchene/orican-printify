// POST /api/shopify-order - Shopify "Order payment" (orders/paid) webhook.
// For every line item whose SKU starts with "PFY-" and that carries a "_design_url" property,
// creates a Printify order in the API shop with that design on the front print area.
// The order is left for review in Printify unless AUTO_PRODUCTION=true.
//
// Env: SHOPIFY_WEBHOOK_SECRET (shown in Shopify admin > Settings > Notifications > Webhooks),
//      PRINTIFY_TOKEN, optional AUTO_PRODUCTION=true
const crypto = require("crypto");
const { waitUntil } = require("@vercel/functions");
const { sendToPrintify, logRun } = require("../lib/orders");

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function validHmac(raw, header) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const digest = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  const a = Buffer.from(digest), b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const raw = await readRaw(req);
  if (!validHmac(raw, req.headers["x-shopify-hmac-sha256"])) {
    waitUntil(logRun({ source: "webhook", error: "bad signature", secret_set: !!process.env.SHOPIFY_WEBHOOK_SECRET }));
    return res.status(401).json({ error: "bad signature" });
  }

  let order;
  try { order = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "bad json" }); }

  // Answer Shopify within its 5 s window; do the Printify work after responding.
  waitUntil(
    sendToPrintify(order)
      .then((r) => logRun({ source: "webhook", order: order.name, ...r }))
      .catch((e) => logRun({ source: "webhook", order: order.name, error: String(e.message || e) }))
  );
  res.status(200).json({ ok: true });
};

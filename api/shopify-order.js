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

// Disable Vercel's automatic body parser so we receive the raw, untampered stream for HMAC
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function readRaw(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(Buffer.from(req.body, "utf8"));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      // Fallback: if stream was empty but req.body was pre-parsed by middleware
      if (buf.length === 0 && req.body && typeof req.body === "object") {
        return resolve(Buffer.from(JSON.stringify(req.body), "utf8"));
      }
      resolve(buf);
    });
    req.on("error", reject);
  });
}

function verifyHmac(raw, header) {
  const secret = (process.env.SHOPIFY_WEBHOOK_SECRET || "").trim();
  if (!secret || !header) {
    return { valid: false, reason: !secret ? "secret missing" : "header missing" };
  }
  const digest = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(String(header).trim());
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return {
    valid,
    digest,
    header: String(header).trim(),
    rawBytes: raw.length,
    secretLen: secret.length,
  };
}

module.exports = async (req, res) => {
  console.log(`[Webhook] ${req.method} /api/shopify-order received`, {
    topic: req.headers["x-shopify-topic"] || null,
    shop: req.headers["x-shopify-shop-domain"] || null,
    hasHmac: !!req.headers["x-shopify-hmac-sha256"],
  });

  if (req.method !== "POST") return res.status(405).end();
  const raw = await readRaw(req);
  const check = verifyHmac(raw, req.headers["x-shopify-hmac-sha256"]);

  if (!check.valid) {
    console.error("[Webhook] HMAC verification failed:", {
      rawBytes: check.rawBytes,
      secretSet: !!process.env.SHOPIFY_WEBHOOK_SECRET,
      secretLength: check.secretLen || 0,
      receivedHmac: check.header || null,
      computedHmac: check.digest || null,
      reason: check.reason || "signature mismatch",
    });
    waitUntil(logRun({ source: "webhook", error: "bad signature", details: check }));
    return res.status(401).json({ error: "bad signature" });
  }

  let order;
  try {
    order = JSON.parse(raw.toString("utf8"));
  } catch (err) {
    console.error("[Webhook] Failed to parse JSON body:", err.message);
    return res.status(400).json({ error: "bad json" });
  }

  console.log(`[Webhook] Order ${order.name || order.id} verified. Line items count: ${order.line_items?.length || 0}`);

  // Answer Shopify within its 5 s window; do the Printify work after responding.
  waitUntil(
    sendToPrintify(order)
      .then((r) => {
        console.log(`[Webhook] Printify order processed for ${order.name}:`, r);
        return logRun({ source: "webhook", order: order.name, ...r });
      })
      .catch((e) => {
        console.error(`[Webhook] Error sending to Printify for ${order.name}:`, e);
        return logRun({ source: "webhook", order: order.name, error: String(e.message || e) });
      })
  );
  res.status(200).json({ ok: true });
};

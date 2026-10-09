// POST /api/shopify-order - Shopify "Order payment" (orders/paid) webhook.
// For every line item whose SKU starts with "PFY-" and that carries a "_design_url" property,
// creates a Printify order in the API shop with that design on the front print area.
// The order is left for review in Printify unless AUTO_PRODUCTION=true.
//
// Env: SHOPIFY_WEBHOOK_SECRET (shown in Shopify admin > Settings > Notifications > Webhooks),
//      PRINTIFY_TOKEN, optional AUTO_PRODUCTION=true
const crypto = require("crypto");
const { waitUntil } = require("@vercel/functions");
const { printify } = require("../lib/printify");
const { SHOP_ID } = require("../lib/blanks");

// SKU format written on Shopify variants: PFY-<blueprint_id>-<print_provider_id>-<printify_variant_id>
const parseSku = (sku) => {
  const m = /^PFY-(\d+)-(\d+)-(\d+)$/.exec(sku || "");
  return m ? { blueprint_id: +m[1], print_provider_id: +m[2], variant_id: +m[3] } : null;
};

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

async function alreadySent(externalId) {
  const res = await printify(`shops/${SHOP_ID}/orders.json?limit=50`);
  return (res.data || []).some((o) => String(o.external_id) === externalId);
}

async function sendToPrintify(order) {
  const externalId = `shopify-${order.id}`;
  const items = [];
  for (const li of order.line_items || []) {
    const ids = parseSku(li.sku);
    const design = (li.properties || []).find((p) => p.name === "_design_url");
    if (!ids || !design || !/^https:\/\//.test(design.value)) continue;
    items.push({ ...ids, print_areas: { front: design.value }, quantity: li.quantity });
  }
  if (!items.length) return { skipped: "no ORICAN custom items" };
  if (await alreadySent(externalId)) return { skipped: "already sent" };

  const a = order.shipping_address || {};
  const created = await printify(`shops/${SHOP_ID}/orders.json`, {
    method: "POST",
    body: {
      external_id: externalId,
      label: order.name,
      line_items: items,
      shipping_method: 1,
      send_shipping_notification: false,
      address_to: {
        first_name: a.first_name || "",
        last_name: a.last_name || "",
        email: order.email || order.contact_email || "",
        phone: a.phone || order.phone || "",
        country: a.country_code || "",
        region: a.province_code || a.province || "",
        address1: a.address1 || "",
        address2: a.address2 || "",
        city: a.city || "",
        zip: a.zip || "",
      },
    },
  });

  if (process.env.AUTO_PRODUCTION === "true" && created && created.id) {
    await printify(`shops/${SHOP_ID}/orders/${created.id}/send_to_production.json`, { method: "POST" });
  }
  return { printify_order_id: created && created.id };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const raw = await readRaw(req);
  if (!validHmac(raw, req.headers["x-shopify-hmac-sha256"])) return res.status(401).json({ error: "bad signature" });

  let order;
  try { order = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "bad json" }); }

  // Answer Shopify within its 5 s window; do the Printify work after responding.
  waitUntil(
    sendToPrintify(order)
      .then((r) => console.log("orican order", order.name, JSON.stringify(r)))
      .catch((e) => console.error("orican order FAILED", order.name, String(e.message || e)))
  );
  res.status(200).json({ ok: true });
};

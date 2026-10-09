// Shopify order -> Printify order. Shared by the webhook and the admin test endpoint.
const { put } = require("@vercel/blob");
const { printify } = require("./printify");
const { SHOP_ID } = require("./blanks");

// SKU format written on Shopify variants: PFY-<blueprint_id>-<print_provider_id>-<printify_variant_id>
const parseSku = (sku) => {
  const m = /^PFY-(\d+)-(\d+)-(\d+)$/.exec(sku || "");
  return m ? { blueprint_id: +m[1], print_provider_id: +m[2], variant_id: +m[3] } : null;
};

function printifyItems(order) {
  const items = [];
  for (const li of order.line_items || []) {
    const ids = parseSku(li.sku);
    const design = (li.properties || []).find((p) => p.name === "_design_url");
    if (!ids || !design || !/^https:\/\//.test(design.value)) continue;
    items.push({ ...ids, print_areas: { front: design.value }, quantity: li.quantity });
  }
  return items;
}

// Printify echoes our external_id back, but not always under that name (it can sit in metadata).
const externalIdOf = (o) =>
  String((o && (o.external_id || (o.metadata && (o.metadata.shop_order_id || o.metadata.external_id)))) || "");

async function alreadySent(externalId) {
  const res = await printify(`shops/${SHOP_ID}/orders.json?limit=50`);
  return (res.data || []).some((o) => externalIdOf(o) === externalId);
}

async function sendToPrintify(order, { externalPrefix = "shopify" } = {}) {
  const externalId = `${externalPrefix}-${order.id}`;
  const items = printifyItems(order);
  if (!items.length) return { skipped: "no ORICAN custom items", line_items: (order.line_items || []).length };
  if (await alreadySent(externalId)) return { skipped: "already sent", external_id: externalId };

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

  let production = null;
  if (process.env.AUTO_PRODUCTION === "true" && created && created.id) {
    production = await printify(`shops/${SHOP_ID}/orders/${created.id}/send_to_production.json`, { method: "POST" });
  }
  return { printify_order_id: created && created.id, items: items.length, sent_to_production: !!production };
}

// Small, address-free record of each webhook run, readable via /api/status.
async function logRun(entry) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return;
    const name = `logs/orders/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await put(name, JSON.stringify({ at: new Date().toISOString(), ...entry }), {
      access: "public", contentType: "application/json", addRandomSuffix: true,
    });
  } catch (e) {
    console.error("log failed", String(e.message || e));
  }
}

module.exports = { parseSku, printifyItems, sendToPrintify, logRun, externalIdOf };

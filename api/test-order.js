// POST /api/test-order   (header x-admin-key: ADMIN_KEY)
// Runs the real Shopify->Printify order code on a fake paid order (heavy crew, White L, the
// placeholder design, a test address in Paris), then cancels the Printify order immediately
// unless ?keep=1. Nothing is sent to production.
const { printify, isAdmin } = require("../lib/printify");
const { SHOP_ID } = require("../lib/blanks");
const { sendToPrintify } = require("../lib/orders");

module.exports = async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  const keep = new URL(req.url, "http://x").searchParams.get("keep") === "1";
  const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const fake = {
    id: Date.now(),
    name: "#TEST",
    email: "",
    line_items: [{
      sku: "PFY-6-30-12100", quantity: 1,
      properties: [{ name: "_design_url", value: `${origin}/orican-placeholder.png` }],
    }],
    shipping_address: {
      first_name: "Test", last_name: "ORICAN", address1: "10 Rue de Rivoli",
      city: "Paris", zip: "75004", country_code: "FR",
    },
  };
  const saved = process.env.AUTO_PRODUCTION;
  process.env.AUTO_PRODUCTION = "false"; // a test never goes to production
  try {
    const result = await sendToPrintify(fake, { externalPrefix: "test" });
    let order = null, cancelled = null;
    if (result.printify_order_id) {
      order = await printify(`shops/${SHOP_ID}/orders/${result.printify_order_id}.json`);
      if (!keep) {
        try { cancelled = await printify(`shops/${SHOP_ID}/orders/${result.printify_order_id}/cancel.json`, { method: "POST" }); }
        catch (e) { cancelled = { error: String(e.message || e) }; }
      }
    }
    res.status(200).json({
      result,
      printify_order: order && {
        id: order.id, status: order.status, total_price: order.total_price, total_shipping: order.total_shipping,
        line_items: (order.line_items || []).map((l) => ({ variant_id: l.variant_id, status: l.status, cost: l.cost, shipping_cost: l.shipping_cost })),
      },
      cancelled: cancelled && (cancelled.error ? cancelled : { status: cancelled.status }),
    });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  } finally {
    process.env.AUTO_PRODUCTION = saved;
  }
};

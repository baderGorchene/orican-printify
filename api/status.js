// GET /api/status   (header x-admin-key: ADMIN_KEY)
// Health check + the last order-webhook runs (address-free records written by lib/orders.js).
const { list } = require("@vercel/blob");
const { isAdmin } = require("../lib/printify");

module.exports = async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
  const env = {
    PRINTIFY_TOKEN: !!process.env.PRINTIFY_TOKEN,
    SHOPIFY_WEBHOOK_SECRET: !!process.env.SHOPIFY_WEBHOOK_SECRET,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || null,
    AUTO_PRODUCTION: process.env.AUTO_PRODUCTION === "true",
  };
  let runs = [];
  try {
    if (env.BLOB_READ_WRITE_TOKEN) {
      const { blobs } = await list({ prefix: "logs/orders/", limit: 100 });
      const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 10);
      runs = await Promise.all(latest.map((b) => fetch(b.url).then((r) => r.json()).catch(() => ({ url: b.url }))));
    }
  } catch (e) {
    runs = [{ error: String(e.message || e) }];
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ env, runs });
};

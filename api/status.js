// GET /api/status   (header x-admin-key: ADMIN_KEY)
// Health check + the last order-webhook runs (address-free records written by lib/orders.js).
const { listFromR2, uploadToR2, deleteFromR2, readJsonFromR2 } = require("../lib/r2");
const { isAdmin } = require("../lib/printify");

module.exports = async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
  const env = {
    PRINTIFY_TOKEN: !!process.env.PRINTIFY_TOKEN,
    SHOPIFY_WEBHOOK_SECRET: !!process.env.SHOPIFY_WEBHOOK_SECRET,
    R2_CONFIGURED: !!(process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID),
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || null,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || null,
    AUTO_PRODUCTION: process.env.AUTO_PRODUCTION === "true",
  };
  // ?diag=1: try a tiny public R2 write and report the result
  let r2Write = null;
  if (new URL(req.url, "http://x").searchParams.get("diag") === "1") {
    try {
      await uploadToR2("logs/diag.txt", "ok", "text/plain");
      await deleteFromR2(["logs/diag.txt"]);
      r2Write = { ok: true };
    } catch (e) {
      r2Write = { ok: false, error: String(e.message || e) };
    }
  }
  let runs = [];
  try {
    if (env.R2_CONFIGURED) {
      const blobs = await listFromR2("logs/orders/");
      const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 10);
      runs = await Promise.all(
        latest.map((b) => readJsonFromR2(b.pathname).catch(() => ({ url: b.url, pathname: b.pathname })))
      );
    }
  } catch (e) {
    runs = [{ error: String(e.message || e) }];
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ env, r2Write, runs });
};

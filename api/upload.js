// POST /api/upload - handles design and asset uploads directly to Cloudflare R2.
const { uploadToR2 } = require("../lib/r2.js");
const { cors } = require("../lib/cors");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!req.headers.origin) return res.status(403).json({ error: "origin required" });

  try {
    const { key, pathname, body, data, contentType } = req.body || {};
    const targetKey = key || pathname || `designs/${Date.now()}.png`;
    const content = body || data || "";
    const type = contentType || "image/png";

    const publicBase = process.env.R2_PUBLIC_URL || `https://${process.env.R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const result = await uploadToR2(targetKey, Buffer.isBuffer(content) ? content : Buffer.from(content, typeof content === "string" && content.startsWith("data:") ? "base64" : "utf8"), type);

    const url = `${publicBase}/${targetKey}`;
    res.status(200).json({ ok: true, key: targetKey, url, result });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
};

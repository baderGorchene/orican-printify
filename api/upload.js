// POST /api/upload - called by the storefront customizer (via @vercel/blob/client `upload()`).
// Issues a short-lived token so the browser uploads the design PNG straight to Vercel Blob
// (bypassing the 4.5 MB function body limit). Only PNGs up to 40 MB under designs/ are accepted,
// and only from the origins in ALLOWED_ORIGINS.
const { handleUpload } = require("@vercel/blob/client");
const { cors } = require("../lib/cors");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!req.headers.origin) return res.status(403).json({ error: "origin required" });
  try {
    const json = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^designs\/[\w.-]+\.png$/.test(pathname)) throw new Error("invalid path");
        return {
          allowedContentTypes: ["image/png"],
          maximumSizeInBytes: 40 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    res.status(200).json(json);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
};

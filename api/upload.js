// POST /api/upload - called by the storefront customizer (via @vercel/blob/client `upload()`).
// Issues a short-lived token so the browser uploads the print-resolution PNG straight to Vercel Blob
// (bypassing the 4.5 MB function body limit). Only PNGs up to 40 MB under designs/ are accepted.
const { handleUpload } = require("@vercel/blob/client");
const { cors } = require("../lib/cors");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
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
      onUploadCompleted: async () => {},
    });
    res.status(200).json(json);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
};

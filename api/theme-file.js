// GET /api/theme-file?id=<sha>        -> serves the patched layout built by /api/theme-build (latest with that sha)
// GET /api/theme-file?probe=1         -> a tiny valid Liquid snippet (diagnostics for Shopify's URL import)
// Public on purpose: Shopify's themeFilesUpsert (body type URL) has to download it. It only serves
// files this project wrote under theme/ in its own Blob store.
const { list } = require("@vercel/blob");

module.exports = async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams;
  const ct = q.get("ct") === "bin" ? "application/octet-stream" : "text/plain; charset=utf-8";
  res.setHeader("Cache-Control", "no-store");
  if (q.get("probe")) {
    res.setHeader("Content-Type", ct);
    const kb = Math.min(400, Math.max(0, parseInt(q.get("kb") || "0", 10) || 0));
    const x = "x".repeat(kb * 1024);
    const filler = q.get("fill") === "plain" ? "<!-- " + x + " -->" : q.get("fill") === "tinyraw" ? "{% raw %}x{% endraw %}" : kb ? "{% raw %}" + x + "{% endraw %}" : "";
    if (q.get("noenc")) res.setHeader("Content-Encoding", "identity"); // compressed responses fail Shopify's URL import
    return res.status(200).send("{% comment %}ORICAN url import probe{% endcomment %}" + filler + "<!-- ok -->\n");
  }
  const id = q.get("id") || "";
  if (!/^[a-f0-9]{12}$/.test(id)) return res.status(400).send("bad id");
  try {
    const { blobs } = await list({ prefix: `theme/orican-${id}`, limit: 10 });
    if (!blobs.length) return res.status(404).send("not found");
    const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
    const r = await fetch(latest.url, { cache: "no-store" });
    if (!r.ok) return res.status(502).send("blob fetch failed");
    const body = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", ct);
    // Shopify's URL import fails on compressed responses; "identity" stops Vercel from brotli/gzip-ing it.
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("Content-Length", body.length);
    return res.status(200).send(body);
  } catch (e) {
    return res.status(500).send(String(e.message || e));
  }
};

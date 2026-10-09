// CORS for endpoints the storefront calls. ALLOWED_ORIGINS is a comma-separated list, e.g.
// "https://orican-41i0abev.myshopify.com,https://orican.com"
function cors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true; // handled
  }
  if (origin && !allowed.includes(origin)) {
    res.status(403).json({ error: "origin not allowed" });
    return true;
  }
  return false;
}

module.exports = { cors };

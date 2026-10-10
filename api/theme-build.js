// POST /api/theme-build?src=<public URL of a copy of layout/orican.liquid>   (header x-admin-key)
// Applies the ORICAN Printify wiring to the layout, verifies every edit matched exactly once and that
// the main script still parses, stores the result publicly in Blob and returns its URL, so Shopify's
// themeFilesUpsert can pull it by URL into an UNPUBLISHED theme. Nothing here touches the live theme.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { put } = require("@vercel/blob");
const { isAdmin } = require("../lib/printify");

const read = (f) => fs.readFileSync(path.join(process.cwd(), "theme", f), "utf8").trim();
const count = (s, sub) => s.split(sub).length - 1;
const ALLOWED_SRC = /^https:\/\/(orican-41i0abev\.myshopify\.com\/cdn\/|cdn\.shopify\.com\/)/;

const MAIN_OPEN = '<script>!function(){"use strict";';
const ST_START = "class st{#Nt=0;#l=null;static TEES=";
const ST_END = "class it{static PREVIEW=880;";
const STYLE_END = "</style> </head>";
const PRICE = '<div class="price" id="teePrice">$14.00</div>';
const DATA_TAG = "{% endraw %}{% render 'orican-data' %}{% raw %}";

function build(src) {
  const card = read("blank-card.js"), css = read("blank-card.css");
  if (card.includes("{%") || css.includes("{%")) throw new Error("patch code must not contain Liquid tags");
  if (src.includes("render 'orican-data'")) throw new Error("source is already patched");

  const counts = {
    main_script: count(src, MAIN_OPEN), st_start: count(src, ST_START), st_end: count(src, ST_END),
    style_end: count(src, STYLE_END), price: count(src, PRICE),
  };
  for (const [k, v] of Object.entries(counts)) if (v !== 1) throw new Error(`expected exactly one "${k}", found ${v}`);
  const s0 = src.indexOf(ST_START), s1 = src.indexOf(ST_END);
  if (!(s0 > src.indexOf(MAIN_OPEN) && s1 > s0)) throw new Error("class st is not where expected");

  let out = src.slice(0, s0) + card + src.slice(s1);
  out = out.replace(MAIN_OPEN, DATA_TAG + MAIN_OPEN);
  out = out.replace(STYLE_END, css + STYLE_END);
  out = out.replace(PRICE, '<div class="price" id="teePrice"></div>');

  // checks
  const raw = count(out, "{% raw %}"), endraw = count(out, "{% endraw %}");
  if (raw !== endraw) throw new Error(`unbalanced raw tags: ${raw} vs ${endraw}`);
  const m0 = out.indexOf(MAIN_OPEN) + "<script>".length, m1 = out.indexOf("</script>", m0);
  const code = out.slice(m0, m1);
  try { new Function(code); } catch (e) { throw new Error("main script does not parse: " + e.message); }
  if (!code.includes('static API="https://orican-printify.vercel.app"')) throw new Error("new class st missing from main script");

  const around = (needle, n = 90) => { const i = out.indexOf(needle); return i < 0 ? null : out.slice(Math.max(0, i - n), i + needle.length + n); };
  return {
    out, counts,
    checks: { raw_tags: raw, main_script_chars: code.length, size_before: src.length, size_after: out.length },
    previews: {
      data_tag: around(DATA_TAG), st_start: around("class st{#Nt=0;#l=null;#ci=[]", 60),
      st_end: around(ST_END, 120), css: around(STYLE_END, 120), price: around('id="teePrice"', 60),
    },
  };
}

module.exports = async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  try {
    const srcUrl = new URL(req.url, "http://x").searchParams.get("src") || "";
    if (!ALLOWED_SRC.test(srcUrl)) return res.status(400).json({ error: "src must be a Shopify CDN URL" });
    const r = await fetch(srcUrl, { cache: "no-store" });
    if (!r.ok) return res.status(502).json({ error: `could not fetch src: ${r.status}` });
    const src = await r.text();
    const { out, counts, checks, previews } = build(src);
    const sha = crypto.createHash("sha256").update(out).digest("hex").slice(0, 12);
    const blob = await put(`theme/orican-${sha}.liquid`, out, {
      access: "public", contentType: "text/plain; charset=utf-8", addRandomSuffix: true,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ url: blob.url, sha, counts, checks, previews });
  } catch (err) {
    res.status(422).json({ error: String(err.message || err) });
  }
};

module.exports.build = build;

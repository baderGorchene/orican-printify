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

// snippets/cart-products.liquid (cart page + cart drawer): show the customer's composited preview
// (line item property _preview_url, a public Vercel Blob PNG) instead of the plain variant image.
const CART_IMG = "echo item.image | image_url: width: 250 | image_tag: class: 'cart-items__media-image border-style', style: border_override";
const CART_NEW = [
  "assign orican_pv = item.properties['_preview_url'] | default: '' | escape",
  "assign orican_head = orican_pv | slice: 0, 8",
  "if orican_head == 'https://' and orican_pv contains '.public.blob.vercel-storage.com/designs/'",
  "  assign orican_alt = item.product.title | escape",
  "  echo '<img src=\"' | append: orican_pv | append: '\" class=\"cart-items__media-image border-style\" style=\"' | append: border_override | append: '\" alt=\"' | append: orican_alt | append: '\" loading=\"lazy\">'",
  "else",
  "  " + CART_IMG,
  "endif",
].join("\n");

function buildCart(src) {
  if (src.includes("orican_pv")) throw new Error("cart snippet is already patched");
  const n = count(src, CART_IMG);
  if (n !== 1) throw new Error(`expected exactly one cart image line, found ${n}`);
  const out = src.replace(CART_IMG, CART_NEW);
  const i = out.indexOf("orican_pv");
  return { out, counts: { cart_img: n }, checks: { size_before: src.length, size_after: out.length }, previews: { cart: out.slice(i - 200, i + 900) } };
}

function build(src) {
  const card = read("blank-card.js"), css = read("blank-card.css");
  if (card.includes("{%") || css.includes("{%")) throw new Error("patch code must not contain Liquid tags");
  if (src.includes("render 'orican-data'")) {
    // already-patched layout: swap only the card class for the current theme/blank-card.js
    const NEW_START = card.slice(0, card.indexOf("static"));
    const c0 = count(src, NEW_START), c1 = count(src, ST_END);
    if (c0 !== 1 || c1 !== 1) throw new Error(`repatch: expected one card start and end, found ${c0}/${c1}`);
    const a = src.indexOf(NEW_START), b = src.indexOf(ST_END);
    if (!(b > a)) throw new Error("repatch: card class not where expected");
    const out = src.slice(0, a) + card + src.slice(b);
    const m0 = out.indexOf(MAIN_OPEN) + "<script>".length, m1 = out.indexOf("</script>", m0);
    const code = out.slice(m0, m1);
    try { new Function(code); } catch (e) { throw new Error("main script does not parse: " + e.message); }
    if (!code.includes("_preview_url")) throw new Error("new card missing from main script");
    return { out, counts: { repatch: 1 }, checks: { size_before: src.length, size_after: out.length }, previews: null };
  }

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
    // ?mode=original stores the source unchanged (diagnostics for Shopify's URL import)
    const mode = new URL(req.url, "http://x").searchParams.get("mode");
    const { out, counts, checks, previews } = mode === "original"
      ? { out: src, counts: null, checks: { size: src.length }, previews: null }
      : mode === "cart" ? buildCart(src) : build(src);
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
module.exports.buildCart = buildCart;

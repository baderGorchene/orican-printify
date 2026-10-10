// POST /api/setup   (header x-admin-key: ADMIN_KEY)
// For each ORICAN blank, creates (or reuses) one UNPUBLISHED draft product in the Printify API shop,
// with only the chosen colors/sizes enabled and a placeholder ORICAN mark on the front.
// Returns, per blank: the Printify variant mapping, production cost per variant, and Printify's
// mockup images per color. Nothing is published to any sales channel.
// GET /api/setup returns the same report for existing drafts without creating anything.
const { printify, isAdmin } = require("../lib/printify");
const { SHOP_ID, PROVIDER_ID, BLANKS } = require("../lib/blanks");

const TITLE = (b) => `ORICAN template - ${b.name}`;

async function findDrafts() {
  const found = {};
  for (let page = 1; page <= 10; page++) {
    const res = await printify(`shops/${SHOP_ID}/products.json?limit=50&page=${page}`);
    for (const p of res.data || []) found[p.title] = p;
    if (!res.next_page_url) break;
  }
  return found;
}

async function placeholderImageId(origin, file = "orican-placeholder.png") {
  const up = await printify("uploads/images.json", {
    method: "POST",
    body: { file_name: file, url: `${origin}/${file}` },
  });
  return up.id;
}

function report(blank, product, catalogVariants) {
  const byId = new Map(catalogVariants.map((v) => [v.id, v]));
  const variants = product.variants
    .filter((v) => v.is_enabled)
    .map((v) => {
      const cv = byId.get(v.id) || {};
      return {
        printify_variant_id: v.id,
        color: cv.options ? cv.options.color : null,
        size: cv.options ? cv.options.size : null,
        cost_cents: v.cost,
        sku: v.sku,
      };
    });
  const mockups = {};
  for (const img of product.images || []) {
    if (img.position !== "front") continue;
    for (const vid of img.variant_ids) {
      const cv = byId.get(vid);
      if (!cv) continue;
      const color = cv.options.color;
      if (blank.colors[color] && !mockups[color]) mockups[color] = img.src;
    }
  }
  return {
    key: blank.key,
    name: blank.name,
    blueprint_id: blank.blueprint_id,
    print_provider_id: PROVIDER_ID,
    printify_product_id: product.id,
    colors: blank.colors,
    sizes: blank.sizes,
    variants,
    mockups,
  };
}

module.exports = async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
  const create = req.method === "POST";
  try {
    const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    const drafts = await findDrafts();
    let imageId = null, blankId = null;
    const blankMode = create && new URL(req.url, "http://x").searchParams.get("blank") === "1";
    const out = [];

    for (const blank of BLANKS) {
      const { variants: catalog } = await printify(
        `catalog/blueprints/${blank.blueprint_id}/print_providers/${PROVIDER_ID}/variants.json`, { pace: 650 });
      const wanted = catalog.filter((v) => blank.colors[v.options.color] && blank.sizes.includes(v.options.size));

      let product = drafts[TITLE(blank)];
      if (!product && create) {
        if (!wanted.length) throw new Error(`No matching variants for ${blank.name}`);
        if (!imageId) imageId = await placeholderImageId(origin);
        product = await printify(`shops/${SHOP_ID}/products.json`, {
          method: "POST",
          body: {
            title: TITLE(blank),
            description: "Internal ORICAN template. Not for sale; used for costs and mockups.",
            blueprint_id: blank.blueprint_id,
            print_provider_id: PROVIDER_ID,
            variants: wanted.map((v) => ({ id: v.id, price: 2500, is_enabled: true })),
            print_areas: [{
              variant_ids: wanted.map((v) => v.id),
              placeholders: [{ position: "front", images: [{ id: imageId, x: 0.5, y: 0.42, scale: 0.45, angle: 0 }] }],
            }],
          },
        });
      } else if (product && blankMode) {
        // ?blank=1: swap the placeholder for an invisible image so Printify's mockups show plain
        // shirts (the storefront composites the customer's design onto them itself).
        if (!blankId) blankId = await placeholderImageId(origin, "orican-blank.png");
        const full = await printify(`shops/${SHOP_ID}/products/${product.id}.json`);
        const enabled = full.variants.filter((v) => v.is_enabled).map((v) => v.id);
        await printify(`shops/${SHOP_ID}/products/${product.id}.json`, {
          method: "PUT",
          body: { print_areas: [{ variant_ids: enabled, placeholders: [{ position: "front", images: [{ id: blankId, x: 0.5, y: 0.42, scale: 0.45, angle: 0 }] }] }] },
        });
        product = await printify(`shops/${SHOP_ID}/products/${product.id}.json`);
      } else if (product) {
        product = await printify(`shops/${SHOP_ID}/products/${product.id}.json`);
      }

      out.push(product
        ? report(blank, product, catalog)
        : { key: blank.key, name: blank.name, missing: true, matching_variants: wanted.length });
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ shop_id: SHOP_ID, blanks: out });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
};

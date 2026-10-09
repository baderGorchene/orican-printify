// GET /api/catalog?key=ADMIN_KEY
// Read-only: lists Printify shops and, for the candidate tee blanks, the EU print providers with
// colors, sizes, front print-area size (size L), handling time and shipping cost to France.
// Optional: &models=3001,5000 to narrow the candidates.
const { printify, isAdmin } = require("../lib/printify");

const DEFAULT_MODELS = ["3001", "3005", "3413", "5000", "64000", "1717", "3600", "6005"];
const EU = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV",
                    "LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"]);
const PACE = 650; // stays under the 100 req/min catalog limit

module.exports = async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    const q = new URL(req.url, "http://x").searchParams;
    const models = q.get("models") ? q.get("models").split(",") : DEFAULT_MODELS;

    const shops = await printify("shops.json");
    const providers = await printify("catalog/print_providers.json", { pace: PACE });
    const country = new Map(providers.map((p) => [p.id, p.location && p.location.country]));

    const all = await printify("catalog/blueprints.json", { pace: PACE });
    const picked = all.filter((b) => models.includes(String(b.model)));

    const blueprints = [];
    for (const bp of picked) {
      const entry = { id: bp.id, title: bp.title, brand: bp.brand, model: bp.model, images: bp.images, eu_providers: [] };
      const pps = await printify(`catalog/blueprints/${bp.id}/print_providers.json`, { pace: PACE });

      for (const pp of pps) {
        const c = country.get(pp.id);
        if (!EU.has(c)) continue;
        const { variants } = await printify(`catalog/blueprints/${bp.id}/print_providers/${pp.id}/variants.json`, { pace: PACE });
        const shipping = await printify(`catalog/blueprints/${bp.id}/print_providers/${pp.id}/shipping.json`, { pace: PACE });

        const l = variants.find((v) => v.options.size === "L");
        const front = l && l.placeholders.find((p) => p.position === "front");
        const fr = shipping.profiles.find((p) => p.countries.includes("FR"))
               || shipping.profiles.find((p) => p.countries.includes("REST_OF_THE_WORLD"));

        entry.eu_providers.push({
          id: pp.id,
          title: pp.title,
          country: c,
          decoration_methods: pp.decoration_methods,
          colors: [...new Set(variants.map((v) => v.options.color))].sort(),
          sizes: [...new Set(variants.map((v) => v.options.size))],
          variant_count: variants.length,
          front_print_px_L: front || null,
          handling_time: shipping.handling_time,
          ship_to_FR: fr ? { first_item: fr.first_item, additional_items: fr.additional_items } : null,
        });
      }
      blueprints.push(entry);
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ shops, blueprints });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
};

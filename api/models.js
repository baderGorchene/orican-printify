// /api/models - the 3D model catalogue offered by the storefront customizer's design picker.
// Files live in Vercel Blob under models/<slug>/: model.<glb|obj|fbx> (+ model.mtl, texture.*), plus the
// picker images thumb.* and spin.webp (a strip of pre-rendered angles). The folder name is the model's
// name. Uploads get Blob's random suffix (model-<id>.glb) so a re-upload never hides behind a cached URL;
// the newest file of each kind wins.
// Schedules and event packs live in config/catalog-<id>.json (newest wins, saved by the dashboard):
//   { models: { <slug>: { from?, until? } }, packs: [{ id, name, from?, until?, models: [slug] }] }
// A model shows only inside its window (no dates = always); a pack is a picker section while it runs.
//   GET                                         public: [{ slug, name, model, mtl, texture, thumb, spin, size }]
//                                               (visible models only; size = model + mtl + texture bytes)
//   GET ?view=shop                              public: { models, packs: [{ id, name, until, models: [slug] }] }
//   GET ?view=all                               public: { models (all, with from/until), packs (all) } - dashboard
//   POST (from @vercel/blob/client upload())    admin: client-upload token, clientPayload = ADMIN_KEY
//   POST { action: "delete", slug }             admin (x-admin-key): removes models/<slug>/ and its schedule/pack entries
//   POST { action: "prune", slug, keep: [url] } admin (x-admin-key): removes every file in models/<slug>/ not in keep
//   POST { action: "config", config }           admin (x-admin-key): replaces schedules and packs
const { handleUpload } = require("@vercel/blob/client");
const { list, del, put } = require("@vercel/blob");
const { isAdmin } = require("../lib/printify");

const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;
const PATH = /^models\/([a-z0-9][a-z0-9-]{0,60})\/(?:model(?:-[A-Za-z0-9]+)?\.(glb|obj|fbx|mtl)|(texture|thumb|spin)(?:-[A-Za-z0-9]+)?\.(png|jpe?g|webp))$/;
const DOWNLOADED = ["model", "mtl", "texture"];
const CONFIG = "config/catalog";
const EMPTY = () => ({ models: {}, packs: [] });

// Blob listing -> catalogue entries (newest file per kind); folders without a model are skipped, newest first.
function group(blobs) {
  const by = {};
  for (const b of blobs) {
    const m = PATH.exec(b.pathname);
    if (!m) continue;
    const kind = m[2] === "mtl" ? "mtl" : m[2] ? "model" : m[3];
    const at = new Date(b.uploadedAt).getTime();
    const e = (by[m[1]] ||= { slug: m[1], files: {} });
    if (!e.files[kind] || at >= e.files[kind].at) e.files[kind] = { url: b.url, size: b.size || 0, at };
  }
  return Object.values(by)
    .filter((e) => e.files.model)
    .sort((a, b) => b.files.model.at - a.files.model.at)
    .map(({ slug, files }) => ({
      slug,
      name: slug.replace(/-/g, " "),
      model: files.model.url,
      mtl: files.mtl ? files.mtl.url : null,
      texture: files.texture ? files.texture.url : null,
      thumb: files.thumb ? files.thumb.url : null,
      spin: files.spin ? files.spin.url : null,
      size: DOWNLOADED.reduce((n, k) => n + (files[k] ? files[k].size : 0), 0),
    }));
}

// Inside an optional [from, until) window.
const live = (w, now) => !w || ((!w.from || now >= Date.parse(w.from)) && (!w.until || now < Date.parse(w.until)));

// Untrusted dashboard input -> clean config; throws on anything malformed.
function validate(input) {
  const bad = (msg) => { throw new Error(msg); };
  const date = (v, what) => {
    if (v == null || v === "") return undefined;
    if (typeof v !== "string" || Number.isNaN(Date.parse(v))) bad(`invalid date for ${what}`);
    return new Date(v).toISOString();
  };
  const window = (o, what) => {
    const from = date(o.from, what), until = date(o.until, what);
    if (from && until && Date.parse(until) <= Date.parse(from)) bad(`${what}: end must be after start`);
    return { ...(from && { from }), ...(until && { until }) };
  };
  if (!input || typeof input !== "object") bad("config required");
  const models = {};
  for (const [slug, w] of Object.entries(input.models || {})) {
    if (!SLUG.test(slug) || !w || typeof w !== "object") bad(`invalid schedule for ${slug}`);
    const clean = window(w, slug);
    if (clean.from || clean.until) models[slug] = clean;
  }
  if (!Array.isArray(input.packs || [])) bad("packs must be a list");
  if ((input.packs || []).length > 50) bad("too many packs");
  const ids = new Set();
  const packs = (input.packs || []).map((p) => {
    if (!p || typeof p !== "object") bad("invalid pack");
    const name = String(p.name || "").trim();
    if (!name || name.length > 40) bad("pack name must be 1-40 characters");
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(p.id || "") || ids.has(p.id)) bad(`invalid pack id for ${name}`);
    ids.add(p.id);
    if (!Array.isArray(p.models) || p.models.length > 200 || !p.models.every((s) => SLUG.test(s))) bad(`invalid models in ${name}`);
    return { id: p.id, name, ...window(p, name), models: [...new Set(p.models)] };
  });
  return { models, packs };
}

// What each GET view returns, from the catalogue entries, the config and the current time.
function views(entries, cfg, now) {
  const visible = entries.filter((e) => live(cfg.models[e.slug], now));
  const shown = new Set(visible.map((e) => e.slug));
  return {
    list: visible,
    shop: {
      models: visible,
      packs: cfg.packs
        .filter((p) => live(p, now))
        .map((p) => ({ id: p.id, name: p.name, until: p.until || null, models: p.models.filter((s) => shown.has(s)) }))
        .filter((p) => p.models.length),
    },
    all: {
      models: entries.map((e) => ({ ...e, from: (cfg.models[e.slug] || {}).from || null, until: (cfg.models[e.slug] || {}).until || null })),
      packs: cfg.packs,
    },
  };
}

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  return blobs;
}

async function readConfig() {
  const blobs = await listAll(CONFIG);
  if (!blobs.length) return EMPTY();
  const newest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
  const r = await fetch(newest.url, { cache: "no-store" });
  if (!r.ok) throw new Error(`config read failed: HTTP ${r.status}`);
  return validate(await r.json());
}

// Each save gets a fresh URL (no stale CDN copy); older copies are removed after the new one exists.
async function writeConfig(cfg) {
  const old = await listAll(CONFIG);
  await put(`${CONFIG}.json`, JSON.stringify(cfg), { access: "public", addRandomSuffix: true, contentType: "application/json" });
  if (old.length) await del(old.map((b) => b.url));
}

async function handler(req, res) {
  if (req.method === "GET") {
    const view = new URL(req.url, "http://x").searchParams.get("view");
    const [blobs, cfg] = await Promise.all([listAll("models/"), readConfig()]);
    const v = views(group(blobs), cfg, Date.now());
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", view === "all" ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(view === "all" ? v.all : view === "shop" ? v.shop : v.list);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const body = req.body || {};
  if (body.action === "config") {
    if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
    let cfg;
    try { cfg = validate(body.config); } catch (err) { return res.status(400).json({ error: err.message }); }
    await writeConfig(cfg);
    return res.status(200).json(cfg);
  }
  if (body.action === "delete" || body.action === "prune") {
    if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
    if (!SLUG.test(body.slug || "")) return res.status(400).json({ error: "invalid slug" });
    const keep = new Set(body.action === "prune" ? body.keep || [] : []);
    if (body.action === "prune" && !keep.size) return res.status(400).json({ error: "keep required" });
    const gone = (await listAll(`models/${body.slug}/`)).filter((b) => !keep.has(b.url)).map((b) => b.url);
    if (gone.length) await del(gone);
    if (body.action === "delete") {
      // Forget the model's schedule and pack memberships too.
      const cfg = await readConfig();
      const inPacks = cfg.packs.some((p) => p.models.includes(body.slug));
      if (cfg.models[body.slug] || inPacks) {
        delete cfg.models[body.slug];
        cfg.packs.forEach((p) => { p.models = p.models.filter((s) => s !== body.slug); });
        await writeConfig(cfg);
      }
    }
    return res.status(200).json({ deleted: gone.length });
  }

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!process.env.ADMIN_KEY || clientPayload !== process.env.ADMIN_KEY) throw new Error("unauthorized");
        if (!PATH.test(pathname)) throw new Error("invalid path");
        // 120 MB matches the customizer's own limit for 3D files.
        return { maximumSizeInBytes: 120 * 1024 * 1024, addRandomSuffix: true };
      },
    });
    res.status(200).json(json);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
}

module.exports = handler;
module.exports.group = group;
module.exports.validate = validate;
module.exports.views = views;
module.exports.PATH = PATH;

if (require.main === module) {
  const assert = require("assert");
  const blobs = [
    { pathname: "models/skull/model.glb", url: "u1", uploadedAt: "2026-01-01", size: 100 },
    { pathname: "models/skull/thumb.png", url: "u2", uploadedAt: "2026-01-01", size: 7 },
    { pathname: "models/rose/model.obj", url: "u3", uploadedAt: "2026-02-01" },
    { pathname: "models/rose/model.mtl", url: "u4", uploadedAt: "2026-02-01" },
    { pathname: "models/rose/texture.jpg", url: "u5", uploadedAt: "2026-02-01" },
    { pathname: "models/orphan/thumb.png", url: "u6", uploadedAt: "2026-03-01" },
    { pathname: "models/../evil.glb", url: "u7", uploadedAt: "2026-03-01" },
    // re-upload with Blob's random suffix: the newer model and spin win
    { pathname: "models/skull/model-AbC123xyz.glb", url: "u8", uploadedAt: "2026-04-01", size: 30 },
    { pathname: "models/skull/spin-Q9w8E7.webp", url: "u9", uploadedAt: "2026-04-01", size: 5 },
  ];
  const g = group(blobs);
  assert.deepStrictEqual(g.map((e) => e.slug), ["skull", "rose"]);
  assert.deepStrictEqual(g[1], { slug: "rose", name: "rose", model: "u3", mtl: "u4", texture: "u5", thumb: null, spin: null, size: 0 });
  assert.strictEqual(g[0].model, "u8");
  assert.strictEqual(g[0].spin, "u9");
  assert.strictEqual(g[0].thumb, "u2");
  assert.strictEqual(g[0].size, 30); // only the current model counts; thumb/spin are not downloaded on pick
  assert(!PATH.test("models/x/model.exe") && !PATH.test("designs/x.png") && !PATH.test("models/X/model.glb"));
  assert(!PATH.test("models/x/model-a/b.glb") && !PATH.test("models/x/spin.glb"));

  // Schedules and packs
  const cfg = validate({
    models: { skull: { from: "2026-10-01T00:00:00Z", until: "2026-11-01T00:00:00Z" }, rose: { from: "", until: "" } },
    packs: [
      { id: "halloween", name: " Halloween ", from: "2026-10-15T00:00:00Z", until: "2026-11-01T00:00:00Z", models: ["skull", "rose", "skull", "ghost"] },
      { id: "xmas", name: "Xmas", from: "2026-12-01T00:00:00Z", models: ["rose"] },
    ],
  });
  assert.deepStrictEqual(Object.keys(cfg.models), ["skull"]); // empty windows are dropped
  assert.strictEqual(cfg.packs[0].name, "Halloween");
  assert.deepStrictEqual(cfg.packs[0].models, ["skull", "rose", "ghost"]); // deduped
  const at = (d) => Date.parse(d);
  const oct20 = views(g, cfg, at("2026-10-20T12:00:00Z"));
  assert.deepStrictEqual(oct20.list.map((e) => e.slug), ["skull", "rose"]);
  assert.deepStrictEqual(oct20.shop.packs, [{ id: "halloween", name: "Halloween", until: "2026-11-01T00:00:00.000Z", models: ["skull", "rose"] }]);
  const nov2 = views(g, cfg, at("2026-11-02T00:00:00Z"));
  assert.deepStrictEqual(nov2.list.map((e) => e.slug), ["rose"]); // skull's window ended
  assert.deepStrictEqual(nov2.shop.packs, []); // halloween over, xmas not started
  const dec5 = views(g, cfg, at("2026-12-05T00:00:00Z"));
  assert.deepStrictEqual(dec5.shop.packs.map((p) => p.models), [["rose"]]); // xmas, open-ended
  assert.strictEqual(dec5.all.models.find((m) => m.slug === "skull").until, "2026-11-01T00:00:00.000Z");
  for (const badCfg of [
    { packs: [{ id: "a", name: "", models: [] }] },
    { packs: [{ id: "a", name: "A", models: [] }, { id: "a", name: "B", models: [] }] },
    { packs: [{ id: "Bad Id", name: "A", models: [] }] },
    { models: { skull: { from: "2026-11-01", until: "2026-10-01" } } },
    { models: { skull: { from: "not a date" } } },
    { packs: [{ id: "a", name: "A", models: ["../x"] }] },
  ]) assert.throws(() => validate(badCfg));
  console.log("models.js ok");
}

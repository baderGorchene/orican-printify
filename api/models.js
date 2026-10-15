// /api/models - the 3D model catalogue offered by the storefront customizer's Catalogue button.
// Files live in Vercel Blob under models/<slug>/: model.<glb|obj|fbx> (+ model.mtl, texture.*), plus the
// picker images thumb.* and spin.webp (a strip of pre-rendered angles). The folder name is the model's
// name, so there is no manifest to keep in sync. Uploads get Blob's random suffix (model-<id>.glb) so a
// re-upload never hides behind a cached URL; the newest file of each kind wins.
//   GET                                         public: [{ slug, name, model, mtl, texture, thumb, spin, size }]
//                                               (size = bytes the customizer downloads: model + mtl + texture)
//   POST (from @vercel/blob/client upload())    admin: client-upload token, clientPayload = ADMIN_KEY
//   POST { action: "delete", slug }             admin (x-admin-key): removes models/<slug>/
//   POST { action: "prune", slug, keep: [url] } admin (x-admin-key): removes every file in models/<slug>/ not in keep
const { handleUpload } = require("@vercel/blob/client");
const { list, del } = require("@vercel/blob");
const { isAdmin } = require("../lib/printify");

const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;
const PATH = /^models\/([a-z0-9][a-z0-9-]{0,60})\/(?:model(?:-[A-Za-z0-9]+)?\.(glb|obj|fbx|mtl)|(texture|thumb|spin)(?:-[A-Za-z0-9]+)?\.(png|jpe?g|webp))$/;
const DOWNLOADED = ["model", "mtl", "texture"];

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

async function handler(req, res) {
  if (req.method === "GET") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(group(await listAll("models/")));
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const body = req.body || {};
  if (body.action === "delete" || body.action === "prune") {
    if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
    if (!SLUG.test(body.slug || "")) return res.status(400).json({ error: "invalid slug" });
    const keep = new Set(body.action === "prune" ? body.keep || [] : []);
    if (body.action === "prune" && !keep.size) return res.status(400).json({ error: "keep required" });
    const gone = (await listAll(`models/${body.slug}/`)).filter((b) => !keep.has(b.url)).map((b) => b.url);
    if (gone.length) await del(gone);
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
  console.log("models.js ok");
}

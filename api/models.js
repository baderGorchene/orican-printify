// /api/models - the 3D model catalogue the storefront customizer offers next to "Upload 3D design".
// Files live in Vercel Blob as models/<slug>/model.<glb|obj|fbx> (+ model.mtl, texture.*, thumb.*);
// the folder name is the model's name, so there is no manifest to keep in sync.
//   GET                                         public: [{ slug, name, model, mtl, texture, thumb, size }]
//                                               (size = bytes the customizer downloads: model + mtl + texture)
//   POST (from @vercel/blob/client upload())    admin: client-upload token, clientPayload = ADMIN_KEY
//   POST { action: "delete", slug }             admin (x-admin-key): removes models/<slug>/
const { handleUpload } = require("@vercel/blob/client");
const { list, del } = require("@vercel/blob");
const { isAdmin } = require("../lib/printify");

const PATH = /^models\/([a-z0-9][a-z0-9-]{0,60})\/(model\.(glb|obj|fbx|mtl)|(texture|thumb)\.(png|jpe?g|webp))$/;

// Blob listing -> catalogue entries; folders without a model file are skipped, newest first.
function group(blobs) {
  const by = {};
  for (const b of blobs) {
    const m = PATH.exec(b.pathname);
    if (!m) continue;
    const e = (by[m[1]] ||= { slug: m[1], name: m[1].replace(/-/g, " "), model: null, mtl: null, texture: null, thumb: null, size: 0, at: 0 });
    const kind = m[3] === "mtl" ? "mtl" : m[3] ? "model" : m[4];
    e[kind] = b.url;
    if (kind !== "thumb") e.size += b.size || 0;
    if (kind === "model") e.at = new Date(b.uploadedAt).getTime();
  }
  return Object.values(by)
    .filter((e) => e.model)
    .sort((a, b) => b.at - a.at)
    .map(({ at, ...e }) => e);
}

async function handler(req, res) {
  if (req.method === "GET") {
    const blobs = [];
    let cursor;
    do {
      const r = await list({ prefix: "models/", cursor, limit: 1000 });
      blobs.push(...r.blobs);
      cursor = r.hasMore ? r.cursor : null;
    } while (cursor);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(group(blobs));
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const body = req.body || {};
  if (body.action === "delete") {
    if (!isAdmin(req)) return res.status(401).json({ error: "unauthorized" });
    if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(body.slug || "")) return res.status(400).json({ error: "invalid slug" });
    const { blobs } = await list({ prefix: `models/${body.slug}/` });
    if (blobs.length) await del(blobs.map((b) => b.url));
    return res.status(200).json({ deleted: blobs.length });
  }

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!process.env.ADMIN_KEY || clientPayload !== process.env.ADMIN_KEY) throw new Error("unauthorized");
        if (!PATH.test(pathname)) throw new Error("invalid path");
        // 120 MB matches the customizer's own limit for 3D files.
        return { maximumSizeInBytes: 120 * 1024 * 1024, addRandomSuffix: false, allowOverwrite: true };
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
  ];
  const g = group(blobs);
  assert.deepStrictEqual(g.map((e) => e.slug), ["rose", "skull"]);
  assert.deepStrictEqual(g[0], { slug: "rose", name: "rose", model: "u3", mtl: "u4", texture: "u5", thumb: null, size: 0 });
  assert.strictEqual(g[1].size, 100); // thumb not counted
  assert.strictEqual(g[1].thumb, "u2");
  assert(!PATH.test("models/x/model.exe") && !PATH.test("designs/x.png") && !PATH.test("models/X/model.glb"));
  console.log("models.js ok");
}

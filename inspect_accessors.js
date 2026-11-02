const fs = require('fs');
const path = require('path');
for (const envFile of ['.env.local', '.env']) {
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const idx = line.indexOf('=');
      if (idx > 0 && !line.trim().startsWith('#')) {
        const k = line.slice(0, idx).trim();
        let v = line.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}
const { readBufferFromR2 } = require('./lib/r2.js');

async function inspectGlb() {
  const buf = await readBufferFromR2('models/hungry-doggo/model.glb');
  const chunk0Len = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + chunk0Len);
  const gltf = JSON.parse(jsonStr);

  console.log('Mesh primitive:', JSON.stringify(gltf.meshes[0].primitives, null, 2));
  console.log('Accessors:');
  gltf.accessors.forEach((acc, i) => {
    console.log(`Accessor ${i}: type=${acc.type}, componentType=${acc.componentType}, count=${acc.count}, bufferView=${acc.bufferView}, byteOffset=${acc.byteOffset || 0}`);
  });
  console.log('BufferViews:');
  gltf.bufferViews.forEach((bv, i) => {
    console.log(`BufferView ${i}: byteLength=${bv.byteLength}, byteOffset=${bv.byteOffset || 0}, byteStride=${bv.byteStride}`);
  });
}

inspectGlb().catch(console.error);

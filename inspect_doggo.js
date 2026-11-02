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
  console.log('Downloading hungry-doggo from R2 to inspect...');
  const buf = await readBufferFromR2('models/hungry-doggo/model.glb');
  console.log('GLB size:', (buf.length / (1024 * 1024)).toFixed(2), 'MB');
  
  // Read GLB header: magic (4 bytes), version (4 bytes), length (4 bytes)
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const totalLen = buf.readUInt32LE(8);
  console.log('GLB magic:', magic.toString(16), 'version:', version, 'length:', totalLen);
  
  // Chunk 0: JSON
  const chunk0Len = buf.readUInt32LE(12);
  const chunk0Type = buf.readUInt32LE(16); // 0x4E4F534A is JSON
  const jsonStr = buf.toString('utf8', 20, 20 + chunk0Len);
  const gltf = JSON.parse(jsonStr);
  
  console.log('GLTF keys:', Object.keys(gltf));
  console.log('Meshes count:', (gltf.meshes || []).length);
  console.log('Accessors count:', (gltf.accessors || []).length);
  console.log('Buffers count:', (gltf.buffers || []).length);
  console.log('BufferViews count:', (gltf.bufferViews || []).length);
  console.log('Images count:', (gltf.images || []).length);
  console.log('Materials count:', (gltf.materials || []).length);
  console.log('Animations count:', (gltf.animations || []).length);
  console.log('Skins count:', (gltf.skins || []).length);
  console.log('Extensions used:', gltf.extensionsUsed || []);
  console.log('Extensions required:', gltf.extensionsRequired || []);
  
  // Let's check why the file is 42 MB!
  if (gltf.images && gltf.images.length > 0) {
    console.log('Images details:');
    gltf.images.forEach((img, i) => {
      const bv = gltf.bufferViews[img.bufferView];
      console.log(`Image ${i}: name=${img.name}, mimeType=${img.mimeType}, byteLength=${bv ? (bv.byteLength / (1024*1024)).toFixed(2) + ' MB' : 'uri: ' + img.uri}`);
    });
  }

  // Check buffer size vs geometry
  if (gltf.bufferViews) {
    let geomBytes = 0;
    let imgBytes = 0;
    const imgBVs = new Set((gltf.images || []).map(img => img.bufferView));
    gltf.bufferViews.forEach((bv, i) => {
      if (imgBVs.has(i)) {
        imgBytes += bv.byteLength;
      } else {
        geomBytes += bv.byteLength;
      }
    });
    console.log(`Total Geometry/Animation bytes: ${(geomBytes / (1024*1024)).toFixed(2)} MB`);
    console.log(`Total Image/Texture bytes: ${(imgBytes / (1024*1024)).toFixed(2)} MB`);
  }
}

inspectGlb().catch(console.error);


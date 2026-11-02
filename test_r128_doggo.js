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

async function testGlb() {
  const threeSrc = await (await fetch('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.js')).text();
  const loaderText = await (await fetch('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js')).text();
  const exporterText = await (await fetch('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js')).text();

  global.window = global;
  global.self = global;
  global.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

  const fn = new Function('window', 'self', threeSrc + '; return THREE;');
  const THREE = fn(global, global);
  global.THREE = THREE;
  new Function('THREE', 'self', loaderText)(THREE, global);
  new Function('THREE', 'self', exporterText)(THREE, global);

  console.log('THREE loaded successfully, revision:', THREE.REVISION);
  
  const { readBufferFromR2 } = require('./lib/r2.js');
  const buf = await readBufferFromR2('models/hungry-doggo/model.glb');
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  new THREE.GLTFLoader().parse(arrayBuffer, '', (gltf) => {
    console.log('Parsed successfully!');
    const scene = gltf.scene;
    scene.traverse(node => {
      if (node.isMesh && node.geometry) {
        console.log('Mesh found:', node.name);
        console.log('Geometry attributes:', Object.keys(node.geometry.attributes));
        for (const [k, v] of Object.entries(node.geometry.attributes)) {
          console.log(`  attr ${k}: constructor=${v.array ? v.array.constructor.name : 'no array'}, itemSize=${v.itemSize}, count=${v.count}, isInterleaved=${!!v.isInterleavedBufferAttribute}`);
        }
        if (node.geometry.index) {
          console.log(`  index: constructor=${node.geometry.index.array ? node.geometry.index.array.constructor.name : 'no array'}, itemSize=${node.geometry.index.itemSize}, count=${node.geometry.index.count}`);
        }
      }
    });

    console.log('\n--- Testing GLTFExporter.parse() WITHOUT sanitize ---');
    try {
      new THREE.GLTFExporter().parse(scene, (res) => {
        console.log('SUCCESS! Output byteLength:', res.byteLength || res.length);
      }, (err) => {
        console.error('Exporter callback error:', err);
      }, { binary: true });
    } catch (e) {
      console.error('Exporter sync throw:', e.message, e.stack);
    }

  }, (err) => {
    console.error('Loader error:', err);
  });
}

testGlb().catch(console.error);

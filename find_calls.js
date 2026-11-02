const fs = require('fs');

async function check() {
  const r = await fetch('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js');
  const text = await r.text();
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('processAccessor(')) {
      console.log(`--- Line ${i+1} ---`);
      console.log(lines.slice(Math.max(0, i - 10), i + 10).join('\n'));
    }
  });
}

check();


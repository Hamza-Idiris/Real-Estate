// Performance budget gate: fails the build if shipped JS/CSS grows past agreed limits (gzip sizes).
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const dir = new URL('../dist/assets/', import.meta.url);
const B = { entryJs: 150, lazyJs: 60, css: 15 }; // KB gzip
let bad = 0;
for (const f of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(f)) continue;
  const kb = gzipSync(readFileSync(new URL(f, dir))).length / 1024;
  const limit = f.endsWith('.css') ? B.css : f.startsWith('index-') ? B.entryJs : B.lazyJs;
  const over = kb > limit; if (over) bad++;
  if (over || kb > limit * 0.8) console.log(`${over ? 'FAIL' : 'warn'} ${f}: ${kb.toFixed(1)} KB gz (limit ${limit})`);
}
if (bad) { console.error(`Bundle budget exceeded in ${bad} file(s).`); process.exit(1); }
console.log('Bundle budget OK');

// B9: the production bundle must not contain the prototype store or seed (spec §4.10).
// Run after `vite build`; exits 1 when a marker is found.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Store key, a seed persona's name, the prototype's photo preference key.
const MARKERS = ['simario:v1:', 'Andi Wirawan', 'lembar-foto:'];
const dir = 'dist/assets';
const hits = [];
for (const name of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(join(dir, name), 'utf8');
  for (const m of MARKERS) if (text.includes(m)) hits.push(`${name}: ${m}`);
}
if (hits.length) {
  console.error(`Prototype code in the bundle:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('Bundle has no prototype store or seed.');

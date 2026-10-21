// Exports the prototype seed for the backend (spec §4.6): backend/simario/devtools/fixtures/demo.json
// keeps prototype ids; frontend/src/data/http/legacy-ids.json maps each id to the uuid5 the backend
// derives, for the temporary id bridge (removed in B9). Run: npm run seed:export

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from '@/data/db';
import { buildSeed, staffDirectory } from '@/data/seed';
import { PERMISSIONS } from '@/domain/permissions';

/** uuid.uuid5(uuid.NAMESPACE_DNS, 'simario.ikn.go.id') — same constant as the backend. */
const NAMESPACE_SIMARIO = '08af8ecc-9378-5a4c-9e45-5bbe864684d8';

/** RFC 4122 version-5 UUID of `name` in the SIMARIO namespace. */
export function uuid5(name: string): string {
  const ns = Buffer.from(NAMESPACE_SIMARIO.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface DemoExport {
  generatedFrom: string;
  permissions: typeof PERMISSIONS;
  staffDirectory: typeof staffDirectory;
  db: DB;
}

export function buildExport(): DemoExport {
  return {
    generatedFrom: 'frontend/src/data/seed',
    permissions: PERMISSIONS,
    staffDirectory,
    db: buildSeed(),
  };
}

/** Every `id` in every collection → its uuid5. */
export function buildLegacyIds(db: DB): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rows of Object.values(db) as unknown[][]) {
    for (const row of rows) {
      const id = (row as { id?: unknown }).id;
      if (typeof id === 'string') out[id] = uuid5(id);
    }
  }
  return out;
}

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const out = buildExport();
  writeJson(resolve(root, 'backend/simario/devtools/fixtures/demo.json'), out);
  writeJson(resolve(root, 'frontend/src/data/http/legacy-ids.json'), buildLegacyIds(out.db));
  console.log(`Exported ${Object.keys(out.db).length} collections`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

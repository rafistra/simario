// Exports the prototype seed for the backend (spec §4.6): backend/simario/devtools/fixtures/demo.json
// keeps prototype ids; frontend/src/data/http/legacy-ids.json maps each id to the uuid5 the backend
// derives, for the temporary id bridge (removed in B9). Run: npm run seed:export

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from '@/test/fake/db';
import { buildSeed, staffDirectory } from '@/test/fake/seed';
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
    generatedFrom: 'frontend/src/test/fake/seed',
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

/** Local-only password of every persona in the local Keycloak realm (docs/05). */
export const REALM_PASSWORD = 'simario-demo';

/**
 * Keycloak users for the local realm: every active seed user plus the staff directory (people
 * not registered in SIMARIO, to demo "Akun Anda belum terdaftar"). Username = NIP.
 */
export function buildRealmUsers(db: DB, staff: typeof staffDirectory) {
  const people = [
    ...db.users
      .filter((u) => u.active)
      .map((u) => ({ nip: u.nip, name: u.fullName, email: u.email })),
    ...staff.map((s) => ({ nip: s.nip, name: s.fullName, email: s.email })),
  ];
  return people.map((p) => {
    const [first, ...rest] = p.name.split(' ');
    return {
      username: p.nip,
      enabled: true,
      firstName: first,
      lastName: rest.join(' ') || first,
      email: p.email,
      emailVerified: true,
      attributes: { nip: [p.nip] },
      credentials: [{ type: 'password', value: REALM_PASSWORD, temporary: false }],
    };
  });
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
  const realmPath = resolve(root, 'infra/keycloak/realm-export.json');
  const realm = JSON.parse(readFileSync(realmPath, 'utf8'));
  writeJson(realmPath, { ...realm, users: buildRealmUsers(out.db, out.staffDirectory) });
  console.log(`Exported ${Object.keys(out.db).length} collections`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

// Loader for shared/test-vectors/*.json (spec §4.9), mirrored by backend/tests/vectors.py.
// A string input equal to a fixture name becomes that fixture; "$demo" is the prototype seed,
// "$permissions" the permission catalogue, "$quarters" the seed quarters.

import { buildSeed } from '@/data/seed';
import { PERMISSIONS } from '@/domain/permissions';

export interface VectorCase {
  name: string;
  input: Record<string, unknown>;
  expected: unknown;
}

interface VectorFile {
  rules: Record<string, VectorCase[]>;
  fixtures?: Record<string, unknown>;
}

let demo: ReturnType<typeof buildSeed> | null = null;
const seed = () => (demo ??= buildSeed());

const BUILTIN: Record<string, () => unknown> = {
  $demo: seed,
  $permissions: () => PERMISSIONS,
  $quarters: () => seed().quarters,
};

export function loadVectors(file: VectorFile): Record<string, VectorCase[]> {
  const fixtures = file.fixtures ?? {};
  const resolve = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    if (value in BUILTIN) return BUILTIN[value]!();
    if (value in fixtures) return fixtures[value];
    return value;
  };
  return Object.fromEntries(
    Object.entries(file.rules).map(([rule, cases]) => [
      rule,
      cases.map((c) => ({
        ...c,
        input: Object.fromEntries(Object.entries(c.input).map(([k, v]) => [k, resolve(v)])),
      })),
    ]),
  );
}

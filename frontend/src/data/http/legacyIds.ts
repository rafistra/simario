// Temporary id bridge (spec §4.10; removed in B9). The backend uses UUIDs; its demo data uses
// uuid5 of the prototype ids (legacy-ids.json, from `npm run seed:export`). Translating at the
// HTTP boundary lets namespaces that are still local keep working with prototype ids.
// Unknown values pass through unchanged, so entities created in the backend keep their UUIDs.

import legacy from './legacy-ids.json';

const TO_UUID: Record<string, string> = legacy;
const TO_LEGACY: Record<string, string> = Object.fromEntries(
  Object.entries(TO_UUID).map(([id, uuid]) => [uuid, id]),
);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Known ids as whole tokens: after start or / ? # & = - (fragments such as "komentar-cm-9"),
// before end or / ? # &. Longest first so "rr-a1-x" wins over a shorter id inside it.
const ID_TOKEN = new RegExp(
  `(?:^|(?<=[/?#&=-]))(${Object.keys(TO_UUID)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')})(?=$|[/?#&])`,
  'g',
);

/** Maps string values, and object keys that are exactly an id (maps keyed by id). */
function mapDeep(
  value: unknown,
  mapString: (s: string) => string,
  mapKey: (k: string) => string,
): unknown {
  if (typeof value === 'string') return mapString(value);
  if (Array.isArray(value)) return value.map((v) => mapDeep(v, mapString, mapKey));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [mapKey(k), mapDeep(v, mapString, mapKey)]),
    );
  return value;
}

const toUuidString = (s: string) => s.replace(ID_TOKEN, (id) => TO_UUID[id] ?? id);

const toLegacyString = (s: string) =>
  TO_LEGACY[s] ?? s.replace(UUID, (uuid) => TO_LEGACY[uuid] ?? uuid);

/** Prototype ids → backend UUIDs (request bodies, queries, path segments, fragments). */
export function toBackendIds<T>(value: T): T {
  return mapDeep(value, toUuidString, (k) => TO_UUID[k] ?? k) as T;
}

/** Backend UUIDs → prototype ids where known, also inside strings such as target URLs. */
export function toLocalIds<T>(value: T): T {
  return mapDeep(value, toLegacyString, (k) => TO_LEGACY[k] ?? k) as T;
}

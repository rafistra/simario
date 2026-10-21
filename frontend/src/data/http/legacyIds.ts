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

function mapDeep(value: unknown, mapString: (s: string) => string): unknown {
  if (typeof value === 'string') return mapString(value);
  if (Array.isArray(value)) return value.map((v) => mapDeep(v, mapString));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapDeep(v, mapString)]));
  return value;
}

const toUuidString = (s: string) =>
  TO_UUID[s] ??
  (s.includes('/')
    ? s
        .split('/')
        .map((p) => TO_UUID[p] ?? p)
        .join('/')
    : s);

const toLegacyString = (s: string) =>
  TO_LEGACY[s] ?? s.replace(UUID, (uuid) => TO_LEGACY[uuid] ?? uuid);

/** Prototype ids → backend UUIDs (request bodies, queries, path segments). */
export function toBackendIds<T>(value: T): T {
  return mapDeep(value, toUuidString) as T;
}

/** Backend UUIDs → prototype ids where known, also inside strings such as target URLs. */
export function toLocalIds<T>(value: T): T {
  return mapDeep(value, toLegacyString) as T;
}

import { buildSeed, staffDirectory } from '@/data/seed';
import { buildExport, buildLegacyIds, buildRealmUsers, uuid5 } from './export-seed';

// Literal computed once with Python: uuid.uuid5(uuid.uuid5(uuid.NAMESPACE_DNS,
// 'simario.ikn.go.id'), 'usr-andi'). backend/simario/devtools/seed.py must agree.
const ANDI_UUID = '640e8841-12a2-598c-a4d1-f5905f6c4c70';

describe('seed export', () => {
  it('derives the same uuid5 as the backend', () => {
    expect(uuid5('usr-andi')).toBe(ANDI_UUID);
  });

  it('exports the whole prototype seed', () => {
    const out = buildExport();
    expect(out.db.users).toHaveLength(buildSeed().users.length);
    expect(out.permissions).toHaveLength(26);
    expect(out.staffDirectory.length).toBeGreaterThan(0);
  });

  it('creates a realm user per active persona and per unregistered staff member', () => {
    const db = buildSeed();
    const users = buildRealmUsers(db, staffDirectory);
    const andi = users.find((u) => u.username === '198204172008011003')!;
    expect(andi.attributes.nip).toEqual(['198204172008011003']);
    expect(andi.credentials[0]!.value).toBe('simario-demo');
    expect(users.some((u) => u.username === staffDirectory[0]!.nip)).toBe(true);
    expect(users).toHaveLength(db.users.filter((u) => u.active).length + staffDirectory.length);
  });

  it('maps every prototype id to a version-5 uuid', () => {
    const ids = buildLegacyIds(buildSeed());
    expect(ids['usr-andi']).toBe(ANDI_UUID);
    expect(ids['pos-ppk-a1']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

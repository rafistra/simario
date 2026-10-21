import { buildSeed } from '@/data/seed';
import { buildExport, buildLegacyIds, uuid5 } from './export-seed';

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

  it('maps every prototype id to a version-5 uuid', () => {
    const ids = buildLegacyIds(buildSeed());
    expect(ids['usr-andi']).toBe(ANDI_UUID);
    expect(ids['pos-ppk-a1']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

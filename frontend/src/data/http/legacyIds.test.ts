import legacy from './legacy-ids.json';
import { toBackendIds, toLocalIds } from './legacyIds';

const ANDI = '640e8841-12a2-598c-a4d1-f5905f6c4c70';
const A1 = (legacy as Record<string, string>)['pos-ppk-a1']!;
const UNKNOWN = '11111111-2222-4333-8444-555555555555';

describe('legacy id bridge', () => {
  it('maps prototype ids to uuids and back', () => {
    expect(toBackendIds('usr-andi')).toBe(ANDI);
    expect(toLocalIds(ANDI)).toBe('usr-andi');
  });

  it('passes unknown uuids through unchanged', () => {
    expect(toLocalIds(UNKNOWN)).toBe(UNKNOWN);
    expect(toBackendIds('bukan-id')).toBe('bukan-id');
  });

  it('translates uuids inside target urls', () => {
    expect(toLocalIds(`/jabatan/${A1}/papan/2027`)).toBe('/jabatan/pos-ppk-a1/papan/2027');
    expect(toBackendIds('/notifications/ntf-1/read')).toBe(
      `/notifications/${(legacy as Record<string, string>)['ntf-1']}/read`,
    );
  });

  it('walks nested objects and arrays, leaving keys alone', () => {
    const out = toLocalIds({ userId: ANDI, holdings: [{ positionId: A1, line: 1 }] });
    expect(out).toEqual({ userId: 'usr-andi', holdings: [{ positionId: 'pos-ppk-a1', line: 1 }] });
  });
});

describe('legacy id bridge with fragments and queries', () => {
  const ids = legacy as Record<string, string>;
  it('translates ids after # and ? and inside "prefix-id" fragments', () => {
    const url = '/jabatan/pos-ppk-a1/papan/2027/risiko/rr-a1-penyerapan#komentar-cm-1';
    const back = toBackendIds(url);
    expect(back).toBe(
      `/jabatan/${ids['pos-ppk-a1']}/papan/2027/risiko/${ids['rr-a1-penyerapan']}#komentar-${ids['cm-1']}`,
    );
    expect(toLocalIds(back)).toBe(url);
    expect(toBackendIds('/x?risk=rr-a1-penyerapan')).toBe(`/x?risk=${ids['rr-a1-penyerapan']}`);
  });
});

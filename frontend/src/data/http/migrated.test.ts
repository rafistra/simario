import { moduleOfPath, pathVisible } from './migrated';

describe('module gate', () => {
  it('maps paths to modules', () => {
    expect(moduleOfPath('/')).toBe('beranda');
    expect(moduleOfPath('/jabatan/pos-ppk-a1/papan/2027/risiko/rr-1#komentar-1')).toBe('papan');
    expect(moduleOfPath('/jabatan/pos-ppk-a1/penilaian/2027/2')).toBe('penilaian');
    expect(moduleOfPath('/jabatan')).toBe('daftar');
    expect(moduleOfPath('/jabatan-saya')).toBe('admin');
    expect(moduleOfPath('/pengaturan/impor')).toBe('admin');
    expect(moduleOfPath('/jejak-audit?entitas=x')).toBe('audit');
    expect(moduleOfPath('/login')).toBeNull();
  });

  it('hides unmigrated modules only in the trial build, including deep links', () => {
    expect(pathVisible('/jabatan/x/lembar/2027/1', false)).toBe(true);
    expect(pathVisible('/jabatan/x/lembar/2027/1', true)).toBe(false);
    expect(pathVisible('/jabatan/x/riwayat', true)).toBe(false);
    expect(pathVisible('/penilaian', true)).toBe(true);
    expect(pathVisible('/jabatan/x/penilaian/2027/1', true)).toBe(true);
    expect(pathVisible('/metrik', true)).toBe(false);
    expect(pathVisible('/jabatan/x/register/2027', true)).toBe(true);
    expect(pathVisible('/master/template', true)).toBe(true);
    expect(pathVisible('/', true)).toBe(true);
  });
});

# Vektor uji bersama

Aturan bisnis yang ada di dua sisi (TypeScript di `frontend/src/domain/`, Python di `backend/simario/domain/`) diuji dengan kasus yang sama dari berkas JSON di sini (spec integrasi backend §4.9). Vitest dan pytest sama-sama membaca berkas ini, sehingga perilaku kedua sisi tidak bisa bergeser diam-diam.

## Format

```json
{
  "source": "<berkas TS acuan>",
  "rules": {
    "<namaFungsiTS>": [{ "name": "...", "input": {}, "expected": null }]
  },
  "fixtures": { "<nama>": [] }
}
```

- Kunci memakai camelCase seperti TypeScript. Pemuat Python mengubah kunci di dalam `input` menjadi snake_case.
- Nilai string di `input` yang sama dengan nama di `fixtures` diganti isi fixture itu oleh pemuat di kedua sisi.
- Nama fungsi Python = nama TS dalam snake_case (`predicateFor` → `predicate_for`).
- Nilai bawaan yang dikenal kedua pemuat: `"$demo"` = basis data seed prototipe (Python: `demo.json` dengan kunci snake_case), `"$permissions"` = katalog izin, `"$quarters"` = triwulan seed. Pemuat Python juga mengubah kunci `expected` menjadi snake_case.
- `access.json` dan `calendar.json` dibuat dari masukan di `access.test.ts` dan `readAccess.test.ts`, dengan nilai harapan dari implementasi TS acuan. Keluaran `Map` ditulis sebagai daftar pasangan `[[code, scope], …]` urut kode; fungsi yang mengembalikan objek pengguna atau triwulan dibandingkan lewat `id`.

## Aturan

- Vektor baru diambil dari kasus di `*.test.ts` atau dari PRD; kedua sisi wajib lulus.
- Jangan mengedit vektor agar satu sisi lulus tanpa persetujuan pengguna. Bila kedua sisi berbeda, salah satu implementasi yang salah.
- Setelah B9, aturan yang hanya ada di backend tetap memakai vektornya di pytest; uji Vitest-nya dihapus bersama kode frontend-nya.

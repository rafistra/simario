// Shared domain vocabulary. Full entity types (PRD §2.8.1) are added in Tahap 2.

export type Line = 1 | 2 | 3;

export type Capacity = 'pejabat' | 'operator';

export type Predicate = 'kurang' | 'cukup' | 'terkendali';

export const PREDICATE_LABEL: Record<Predicate, string> = {
  kurang: 'Kurang Terkendali',
  cukup: 'Cukup Terkendali',
  terkendali: 'Terkendali',
};

export type RiskType = 'kinerja_anggaran' | 'ketidakpatuhan' | 'kecurangan';

export const RISK_TYPE_LABEL: Record<RiskType, string> = {
  kinerja_anggaran: 'Kinerja Anggaran',
  ketidakpatuhan: 'Ketidakpatuhan',
  kecurangan: 'Kecurangan',
};

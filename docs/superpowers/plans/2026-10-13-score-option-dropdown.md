# Statement-Based Score Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assessors pick a configured statement (kalimat) from a dropdown instead of typing a 0,0–4,0 score; each statement stands for a stored 0–4 value, and numeric scores/averages disappear from every user view except `/master/skala-penilaian`.

**Architecture:** New entity `ScoreOption` per `ScoreBandVersion` (value + label). `Assessment.score` stays numeric; read models replace the number with the statement via `toDisplay()` in `domain/rules/assessment.ts` (filtering in the selector, not JSX). Lembar Mutu keeps computing averages internally but only exposes predicates. The scale page gets a "Pilihan penilaian" card; the PRD is bumped to v2.8 first.

**Tech Stack:** React 18.3 + Vite 6 + TypeScript, Zustand + immer store over localStorage, Vitest + Testing Library. Run all commands from `frontend/`.

**Spec:** `docs/superpowers/specs/2026-10-13-score-option-dropdown-design.md`

## Global Constraints

- UI copy in formal Bahasa Indonesia; code, identifiers, comments, commit messages in English.
- Commit messages: imperative English, **no `Co-Authored-By` or any Claude attribution** (user rule, CLAUDE.md §11).
- Tokens only in CSS (`var(--…)`), no raw hex. Reuse existing classes (`control`, `control--select`, `control-wrap`, `control-wrap__icon`, `field__error`, `t-mono`, `t-eyebrow`).
- Numbers shown in `/master/skala-penilaian` use `formatScore` (comma decimal, mono).
- Never use `new Date()` in business rules; never check role names.
- Dropdown placeholder copy: `— Pilih penilaian —`. Unknown option error: `Pilihan penilaian tidak dikenal.`
- Seed statements come only from `docs/seed/pilihan_penilaian.json` (import via `@seed/`), never copied into code.
- `SCHEMA_VERSION` becomes `9`.
- Breakpoint 900 px; no horizontal scroll at 390 px.
- `npm run build`, `npm run test`, `npm run lint` must pass at the end (and `npm run test` after every task).

## Review Focus

1. **Option value 0** — a statement worth 0 must count as "scored": the "Belum dinilai saja" filter, progress counts, `<select>` value `"0"` and `onCommit(0)` must not treat 0 as empty (old code used `!c.assessment?.score`). Test in Task 5.
2. **Editing a label in the active version after a Lembar snapshot** — frozen snapshots must keep the old statement (INV-22). Test in Task 6.
3. **Draft bands changed so a predicate loses all statements** — saving must be refused with `band-uncovered` even though bands themselves are valid. Test in Task 4.
4. **Old/odd scores** (e.g. 2,5 saved via API, or seed values) — the API must reject non-option scores; seed scores must be snapped without changing predicates. Tests in Tasks 3 and 5.
5. **Audit before/after for a blind assessment** — redaction (VIS-8) must still win over statement labelling; labels only replace non-redacted numbers. Test in Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/PRD_SIMARIO_v2.8.md` (renamed) | Product spec v2.8 |
| `docs/seed/pilihan_penilaian.json` (new) | Illustrative statements |
| `frontend/src/domain/types.ts` | `ScoreOption` type |
| `frontend/src/domain/scoreBands.ts` | Pure option rules: `sortOptions`, `optionFor`, `validateOptions`, `snapToOption` |
| `frontend/src/domain/scoreBands.test.ts` (new) | Unit tests for the above |
| `frontend/src/domain/rules/assessment.ts` | `optionsOf`, `optionLabelOf`, `AssessmentDisplay`, `toDisplay` |
| `frontend/src/data/db.ts` | `scoreOptions` collection, `SCHEMA_VERSION = 9` |
| `frontend/src/data/seed/reference.ts`, `index.ts`, `assessments.ts`, `activity.ts` | Seed options, snap seed scores |
| `frontend/src/data/api/master.ts` | Options in band-version API, `updateOptionLabel` |
| `frontend/src/data/api/assessment.ts` | Option validation, display cells, `options`/`guidance` in view |
| `frontend/src/components/ScoreInput/*` | Dropdown component |
| `frontend/src/pages/assessment/AssessmentPage.tsx`, `AssessmentRow.tsx` | Use dropdown, no numbers |
| `frontend/src/data/api/board.ts`, `pages/board/ThreadPage.tsx` | Quarter card statement |
| `frontend/src/data/api/history.ts`, `pages/history/HistoryPage.tsx` | Chips/detail without numbers |
| `frontend/src/domain/rules/sheets.ts`, `sheetPayload.ts`, `pages/sheets/SheetDocument.tsx`, `pages/home/HomePage.tsx` | Predicate-only Mutu, statement in Lembar Komunikasi |
| `frontend/src/data/api/insights.ts` | Audit labels |
| `frontend/src/pages/master/ScoreOptionsCard.tsx` (new), `ScoreBandsPage.tsx`, `Master.css` | Options card |
| `CLAUDE.md`, `frontend/README.md` | Notes |

---

### Task 1: PRD v2.8

**Files:**
- Rename: `docs/PRD_SIMARIO_v2.7.md` → `docs/PRD_SIMARIO_v2.8.md`
- Modify: `CLAUDE.md` (every `PRD_SIMARIO_v2.7.md` reference)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Rename and fix references**

```bash
cd ..
git mv docs/PRD_SIMARIO_v2.7.md docs/PRD_SIMARIO_v2.8.md
grep -rln "PRD_SIMARIO_v2.7" --include=*.md --include=*.ts --include=*.tsx . | grep -v node_modules
```
Replace each hit's `PRD_SIMARIO_v2.7.md` with `PRD_SIMARIO_v2.8.md` (at least `CLAUDE.md` §2 item 1). Do **not** edit `docs/superpowers/specs/*` (historical).

- [ ] **Step 2: Header and revision history**

In `docs/PRD_SIMARIO_v2.8.md`:
- Header row `Version` → `2.8 (revision of v2.7 dated 11 October 2026) — assessment by statement`; `Date` → `13 October 2026`.
- In the revision table (the row starting `| 2.7 | 11-10-2026 |`), insert above it:
```markdown
| 2.8 | 13-10-2026 | Assessment by statement: scorers pick a configured statement per score value; numeric scores and averages hidden from all user views; ScoreOption added to score band versions | Direktorat Data dan Kecerdasan Buatan |
```

- [ ] **Step 3: Glossary and data model**

- Glossary row `| **Score** (*Skor*) | A number 0.0–4.0 given to a risk in a quarter |` → `| **Score** (*Skor*) | A number 0.0–4.0 given to a risk in a quarter, chosen through a *score option* (statement). Stored, never shown to users outside \`/master/skala-penilaian\` |`
- Add the glossary row after it: `| **Score option** (*Pilihan penilaian*) | A statement that stands for one score value within a score band version; assessors choose statements, not numbers |`
- Glossary row `| **Lembar Mutu** | … |` → `| **Lembar Mutu** | Quarterly summary of the predicate per risk type, per assessor (derived from the average score, which is not shown). Derived |`
- §2.8.1 after the `ScoreBand` row add:
```markdown
| `ScoreOption` | `id`, `version_id`, `value` (numeric 2,1), `label`, `order` | One list per `ScoreBandVersion`, used for every risk. Seed: illustrative statements for 0, 1, 2, 3, 4 from `docs/seed/pilihan_penilaian.json` |
```
- In the invariants table after `INV-3`, add (use the next free INV number; check the table's last id first):
```markdown
| INV-<n> | Within one `ScoreBandVersion`: every band's predicate has at least one `ScoreOption` whose value falls in it; option values and labels are unique; values are 0.0–4.0 with one decimal. Every non-null `Assessment.score` equals a `ScoreOption.value` of its version |
```

- [ ] **Step 4: Display principle**

At the end of §2.7 (after VIS-9 and before the next `##`/`###` heading), add:
```markdown
> **Scores are not displayed (v2.8).** Users see the chosen statement and its predicate, never the numeric score or an average. Numbers appear only on `/master/skala-penilaian`, in the metrics CSV export, and in the import tool. Like VIS rules, this is applied in data selectors, not only hidden in markup.
```

- [ ] **Step 5: Functional requirements**

Edit these rows (find them by id):
- **FR-BRD-004** bullet `One row per risk type: average score and predicate for Lini 1 and each Lini 3 position` → `One row per risk type: predicate for Lini 1 and each Lini 3 position (from the average score, not shown)`.
- **FR-NIL-002** bullet `Per risk: score input 0.0–4.0, step 0.1; the predicate badge updates immediately from the quarter's \`score_band_version_id\`` → `Per risk: a dropdown of the quarter version's score options, a flat list from worst to best, statements only (no numbers), first entry "— Pilih penilaian —"; the predicate badge appears once a statement is chosen`.
- Frame note line `> - Typing a score updates the predicate badge instantly; out-of-range input shows "Skor 0,0–4,0"` → `> - Choosing a statement shows its predicate badge instantly; a score that is not an option of the quarter's version is refused with "Pilihan penilaian tidak dikenal."`
- **RB-NIL-002** `The score is entered; the predicate is derived …` → `A statement is selected and its value is stored as the score; the predicate is derived from the quarter's \`score_band_version_id\` and stored at finalise`.
- **FR-RWY-001** bullet `Each cell: average score and predicate for Lini 1 …` → `Each cell: predicate for Lini 1 and for each Lini 3 position, computed per FR-LBR-004`.
- **FR-LBR-004** first bullet: replace `**average score** of risks … and its predicate` with `the **predicate** of the average score of risks whose result for that assessor has opened (VIS-7), rounded to one decimal before banding; the average itself is neither shown nor printed`.
- **FR-MST-007**: append bullets `<br>• "Pilihan penilaian" per version: statement + value; ≥1 statement per predicate, unique values and statements; saving refused otherwise<br>• Active version: statement text editable in place (audited); adding, removing or revaluing statements requires "Buat Versi Baru"<br>• The 0–4 preview marks each statement's value`.
- Frame note for `/master/skala-penilaian` (the line `> - Version selector, effective date, "Buat Versi Baru"; band table; …`) append `; "Pilihan penilaian" table (Kalimat, Nilai, Predikat)`.
- **FR-MST-010** append bullet `<br>• Score options seeded from \`docs/seed/pilihan_penilaian.json\` (illustrative draft, to be replaced via \`/master/skala-penilaian\`)`.

- [ ] **Step 6: Verify and commit**

```bash
grep -n "score input 0.0–4.0\|Skor 0,0–4,0\|average score and predicate" docs/PRD_SIMARIO_v2.8.md
```
Expected: no output.
```bash
git add -A docs/PRD_SIMARIO_v2.8.md docs/PRD_SIMARIO_v2.7.md CLAUDE.md
git commit -m "Update PRD to v2.8: assessment by statement"
```

---

### Task 2: Domain — `ScoreOption` and pure option rules

**Files:**
- Modify: `frontend/src/domain/types.ts` (after `ScoreBand`, ~line 271)
- Modify: `frontend/src/domain/scoreBands.ts`
- Create: `frontend/src/domain/scoreBands.test.ts`

**Interfaces:**
- Produces:
  - `interface ScoreOption { id: string; versionId: string; value: number; label: string; order: number }`
  - `type BandLike = Pick<ScoreBand, 'lowerExclusive' | 'upperInclusive' | 'order' | 'predicate'>`
  - `predicateFor(score: number, bands: BandLike[]): Predicate | null` (widened param)
  - `sortOptions<T extends { value: number }>(options: T[]): T[]`
  - `optionFor<T extends { value: number }>(score: number, options: T[]): T | null`
  - `interface OptionProblem { kind: 'empty-label' | 'duplicate-label' | 'duplicate-value' | 'out-of-range' | 'band-uncovered'; optionId?: string; predicate?: Predicate }`
  - `validateOptions(options: Pick<ScoreOption, 'id' | 'value' | 'label'>[], bands: BandLike[]): OptionProblem[]`
  - `snapToOption(score: number, options: { value: number }[], bands: BandLike[]): number`

- [ ] **Step 1: Write the failing tests**

`frontend/src/domain/scoreBands.test.ts`:
```ts
import { optionFor, snapToOption, sortOptions, validateOptions } from './scoreBands';
import type { ScoreBand } from './types';

const band = (
  predicate: ScoreBand['predicate'],
  lowerExclusive: number | null,
  upperInclusive: number,
  order: number,
) => ({ predicate, lowerExclusive, upperInclusive, order });
const V1 = [band('kurang', null, 2, 1), band('cukup', 2, 3, 2), band('terkendali', 3, 4, 3)];
const opt = (id: string, value: number, label = `Kalimat ${id}`) => ({ id, value, label });
const FIVE = [opt('a', 0), opt('b', 1), opt('c', 2), opt('d', 3), opt('e', 4)];

describe('score options', () => {
  it('sorts by value and finds an exact value match', () => {
    expect(sortOptions([opt('x', 3), opt('y', 0)]).map((o) => o.id)).toEqual(['y', 'x']);
    expect(optionFor(3, FIVE)?.id).toBe('d');
    expect(optionFor(0, FIVE)?.id).toBe('a');
    expect(optionFor(2.5, FIVE)).toBeNull();
  });

  it('accepts the five seed statements under Versi 1 bands', () => {
    expect(validateOptions(FIVE, V1)).toEqual([]);
  });

  it('reports empty, duplicate and out-of-range options', () => {
    const problems = validateOptions(
      [opt('a', 0, ' '), opt('b', 1, 'Sama'), opt('c', 1, 'sama '), opt('d', 4.25), opt('e', 3), opt('f', 4)],
      V1,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        { kind: 'empty-label', optionId: 'a' },
        { kind: 'duplicate-label', optionId: 'c' },
        { kind: 'duplicate-value', optionId: 'c' },
        { kind: 'out-of-range', optionId: 'd' },
      ]),
    );
  });

  it('flags a predicate with no statement, evaluated against the same version bands', () => {
    // Draft Versi 2 seed bands: gap 1,9–2,0, so value 2 has no predicate and Cukup is uncovered.
    const v2 = [band('kurang', null, 1.9, 1), band('cukup', 2, 2.9, 2), band('terkendali', 2.9, 4, 3)];
    expect(validateOptions(FIVE, v2)).toEqual([{ kind: 'band-uncovered', predicate: 'cukup' }]);
    expect(validateOptions([opt('a', 0), opt('e', 4)], V1)).toEqual([
      { kind: 'band-uncovered', predicate: 'cukup' },
    ]);
  });

  it('flags NaN values (unparseable input) as out of range', () => {
    expect(validateOptions([...FIVE, opt('z', Number.NaN)], V1)).toContainEqual({
      kind: 'out-of-range',
      optionId: 'z',
    });
  });

  it('snaps a legacy score to the nearest option with the same predicate', () => {
    expect(snapToOption(2.7, FIVE, V1)).toBe(3);
    expect(snapToOption(2.1, FIVE, V1)).toBe(3);
    expect(snapToOption(3.4, FIVE, V1)).toBe(4);
    expect(snapToOption(1.8, FIVE, V1)).toBe(2);
    expect(snapToOption(1.6, FIVE, V1)).toBe(2);
    expect(snapToOption(0.5, FIVE, V1)).toBe(0); // tie → lower
    expect(snapToOption(3, FIVE, V1)).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/domain/scoreBands.test.ts`
Expected: FAIL — `optionFor` / `sortOptions` / `validateOptions` / `snapToOption` not exported.

- [ ] **Step 3: Add the type**

In `domain/types.ts`, directly after `interface ScoreBand { … }`:
```ts
/** A statement assessors choose; stands for one score value within a band version (PRD v2.8). */
export interface ScoreOption {
  id: string;
  versionId: string;
  /** 0,0–4,0 with one decimal; unique per version. Never shown outside /master/skala-penilaian. */
  value: number;
  label: string;
  /** Equals the ascending value order. */
  order: number;
}
```

- [ ] **Step 4: Implement the rules**

In `domain/scoreBands.ts`: change the import to `import type { Predicate, ScoreBand, ScoreOption } from './types';`, add
```ts
export type BandLike = Pick<ScoreBand, 'lowerExclusive' | 'upperInclusive' | 'order' | 'predicate'>;
```
change `predicateFor(score: number, bands: ScoreBand[])` to `predicateFor(score: number, bands: BandLike[])`, and append:
```ts
const tenths = (n: number) => Math.round(n * 10);

/** Options in dropdown order: worst (lowest value) to best. */
export function sortOptions<T extends { value: number }>(options: T[]): T[] {
  return [...options].sort((a, b) => a.value - b.value);
}

/** The option whose value equals the score (one-decimal precision). */
export function optionFor<T extends { value: number }>(score: number, options: T[]): T | null {
  return options.find((o) => tenths(o.value) === tenths(score)) ?? null;
}

export interface OptionProblem {
  kind: 'empty-label' | 'duplicate-label' | 'duplicate-value' | 'out-of-range' | 'band-uncovered';
  optionId?: string;
  predicate?: Predicate;
}

/** INV (PRD v2.8): labels/values unique, values 0–4 one decimal, every predicate has a statement. */
export function validateOptions(
  options: Pick<ScoreOption, 'id' | 'value' | 'label'>[],
  bands: BandLike[],
): OptionProblem[] {
  const problems: OptionProblem[] = [];
  const norm = (s: string) => s.trim().toLocaleLowerCase('id');
  const labels = new Set<string>();
  const values = new Set<number>();
  for (const o of options) {
    if (!o.label.trim()) problems.push({ kind: 'empty-label', optionId: o.id });
    else if (labels.has(norm(o.label))) problems.push({ kind: 'duplicate-label', optionId: o.id });
    else labels.add(norm(o.label));
    const valid =
      Number.isFinite(o.value) && o.value >= 0 && o.value <= 4 && tenths(o.value) === o.value * 10;
    if (!valid) problems.push({ kind: 'out-of-range', optionId: o.id });
    else if (values.has(tenths(o.value))) problems.push({ kind: 'duplicate-value', optionId: o.id });
    else values.add(tenths(o.value));
  }
  for (const b of [...bands].sort((x, y) => x.order - y.order)) {
    const covered = options.some(
      (o) => Number.isFinite(o.value) && predicateFor(o.value, bands) === b.predicate,
    );
    if (!covered) problems.push({ kind: 'band-uncovered', predicate: b.predicate });
  }
  return problems;
}

/** Seed migration: the nearest option value with the same predicate as `score` (ties → lower). */
export function snapToOption(score: number, options: { value: number }[], bands: BandLike[]): number {
  const predicate = predicateFor(score, bands);
  const same = sortOptions(options).filter((o) => predicateFor(o.value, bands) === predicate);
  if (same.length === 0) throw new Error(`No score option for predicate ${predicate}`);
  return same.reduce((best, o) =>
    Math.abs(o.value - score) < Math.abs(best.value - score) ? o : best,
  ).value;
}
```
Note `tenths(o.value) === o.value * 10` can fail on float noise (e.g. `0.3 * 10`); if a test with a valid one-decimal value fails, use `Math.abs(tenths(o.value) - o.value * 10) < 1e-9` instead.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/domain/scoreBands.test.ts src/domain/calendar.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/scoreBands.ts src/domain/scoreBands.test.ts
git commit -m "Add score option rules"
```

---

### Task 3: Seed statements, collection, snapped seed scores

**Files:**
- Create: `docs/seed/pilihan_penilaian.json`
- Modify: `frontend/src/data/db.ts`, `frontend/src/data/seed/reference.ts`, `frontend/src/data/seed/index.ts`, `frontend/src/data/seed/assessments.ts`, `frontend/src/data/seed/activity.ts:240-295`
- Test: `frontend/src/data/seed/seed.test.ts`; update `frontend/src/data/api/home.test.ts:25-34`, `frontend/src/data/api/sheets.test.ts:26-40`

**Interfaces:**
- Consumes: `snapToOption`, `sortOptions`, `ScoreOption` (Task 2).
- Produces: `DB.scoreOptions: ScoreOption[]`; seed ids `so-sbv-1-0 … so-sbv-1-4`, `so-sbv-2-0 … so-sbv-2-4`; `export const scoreOptions` in `data/seed/reference.ts`.

- [ ] **Step 1: Create the JSON**

`docs/seed/pilihan_penilaian.json`:
```json
{
  "illustrative": true,
  "note": "Draf sementara, belum bersumber dari dek Rapim. Ganti lewat /master/skala-penilaian.",
  "options": [
    { "value": 0, "label": "Mitigasi belum dilaksanakan" },
    { "value": 1, "label": "Mitigasi baru direncanakan, belum ada pelaksanaan" },
    { "value": 2, "label": "Mitigasi dilaksanakan sebagian, bukti belum memadai" },
    { "value": 3, "label": "Mitigasi dilaksanakan, bukti memadai, efektivitas belum terlihat" },
    { "value": 4, "label": "Mitigasi dilaksanakan penuh dan terbukti efektif" }
  ]
}
```

- [ ] **Step 2: Write the failing seed tests**

Append to `data/seed/seed.test.ts` (it already imports `predicateFor, validateBands`; add `validateOptions` to that import and `import pilihan from '@seed/pilihan_penilaian.json';`; reuse the file's existing `db` setup — read the top of the file and follow it):
```ts
describe('score options (PRD v2.8)', () => {
  it('seeds the illustrative statements for every version', () => {
    for (const v of db.scoreBandVersions) {
      const options = db.scoreOptions.filter((o) => o.versionId === v.id);
      expect(options.map((o) => o.label)).toEqual(pilihan.options.map((o) => o.label));
    }
    const v1 = db.scoreBands.filter((b) => b.versionId === 'sbv-1');
    expect(validateOptions(db.scoreOptions.filter((o) => o.versionId === 'sbv-1'), v1)).toEqual([]);
  });

  it('every seeded score is an option value of its version', () => {
    for (const a of db.assessments.filter((x) => x.score !== null)) {
      const values = db.scoreOptions
        .filter((o) => o.versionId === a.scoreBandVersionId)
        .map((o) => o.value);
      expect(values, a.id).toContain(a.score);
    }
  });
});
```
The existing test `predicate = predicateFor(score, bands)` (line ~46) stays and proves predicates are consistent.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/data/seed/seed.test.ts`
Expected: FAIL — `db.scoreOptions` undefined.

- [ ] **Step 4: Collection + schema version**

`data/db.ts`: add `ScoreOption` to the type import; add `scoreOptions: ScoreOption[];` after `scoreBands` in `DB`; add `'scoreOptions',` after `'scoreBands',` in `COLLECTIONS`; set `export const SCHEMA_VERSION = 9;`.

- [ ] **Step 5: Seed the options**

`data/seed/reference.ts`: add `import pilihan from '@seed/pilihan_penilaian.json';`, add `ScoreOption` to the type import, and after `scoreBands`:
```ts
/** Illustrative statements (docs/seed/pilihan_penilaian.json), copied to every seeded version. */
export const scoreOptions: ScoreOption[] = scoreBandVersions.flatMap((v) =>
  [...pilihan.options]
    .sort((a, b) => a.value - b.value)
    .map((o, i) => ({
      id: `so-${v.id}-${o.value}`,
      versionId: v.id,
      value: o.value,
      label: o.label,
      order: i + 1,
    })),
);
```
`data/seed/index.ts`: import `scoreOptions` from `./reference` and add `scoreOptions,` after `scoreBands,` in the returned DB object.

- [ ] **Step 6: Snap seed assessment scores**

`data/seed/assessments.ts`: change `import { scoreBands } from './reference';` to `import { scoreBands, scoreOptions } from './reference';`, change `import { predicateFor } from '@/domain/scoreBands';` to `import { predicateFor, snapToOption } from '@/domain/scoreBands';`, add below `const BANDS = …`:
```ts
const OPTIONS = scoreOptions.filter((o) => o.versionId === 'sbv-1');
```
and in `makeAssessment` replace
```ts
  const numeric = typeof score === 'number' ? score : null;
```
with
```ts
  // PRD v2.8: scores are option values; DesignBrief scores snap within their predicate.
  const numeric = typeof score === 'number' ? snapToOption(score, OPTIONS, BANDS) : null;
```

- [ ] **Step 7: Snap seed audit values**

`data/seed/activity.ts` lines ~244–290 contain literal scores in audit `before`/`after`. Replace: `score: 2.4` → `score: 3`, `score: 1.6` → `score: 2`, `score: 1.8` → `score: 2`. Leave `predicate` values unchanged (snapping keeps predicates). Run `grep -n "score:" src/data/seed/activity.ts` afterwards; every value must be in {0,1,2,3,4}.

- [ ] **Step 8: Update tests that assert seed numbers**

- `data/api/sheets.test.ts:30` — `.l1.score).toBe(2.4)` → `.toBe(3)`.
- `data/api/sheets.test.ts:37-38` — compare predicates instead of averages (averages are removed in Task 6; doing it now keeps this test stable):
```ts
    expect(mutuFromPayload(p).rows.map((r) => r.cells.map((c) => c.predicate))).toEqual(
      live.rows.map((r) => r.cells.map((c) => c.predicate)),
```
- `data/api/home.test.ts:30-31` — snapped L1 scores are 3, 4, 4 → average 3,7 → Terkendali dengan Baik:
```ts
    // L1 = (3 + 4 + 4) / 3 → Terkendali dengan Baik — Deviasi RPD "Belum relevan" excluded.
    expect(ka.cells[0]).toMatchObject({ predicate: 'terkendali', count: 3 });
```
(Behaviour change, record it in the Task 9 notes: the DesignBrief example's Lini 1 Kinerja Anggaran predicate moves from Cukup to Terkendali dengan Baik because Cukup and TB each have a single statement.)

- [ ] **Step 9: Run all tests**

Run: `npm run test`
Expected: PASS. If another test asserts an old seed score (e.g. `toBe(2.4)`), replace the number with its snapped value (2,4→3, 3,2→4, 3,1→4, 2,6→3, 1,9→2, 1,8→2, 1,6→2, 2,2→3) — never change a predicate expectation except the home.test one above.

- [ ] **Step 10: Commit**

```bash
git add ../docs/seed/pilihan_penilaian.json src/data src/domain
git commit -m "Seed illustrative score options and snap seed scores"
```

---

### Task 4: Master API — options in band versions

**Files:**
- Modify: `frontend/src/data/api/master.ts:601-720`
- Modify: `frontend/src/pages/master/ScoreBandsPage.tsx` (only the two API call sites, to keep the build green)
- Test: `frontend/src/data/api/master.test.ts:157-191`

**Interfaces:**
- Consumes: `validateOptions`, `sortOptions`, `OptionProblem` (Task 2); `DB.scoreOptions` (Task 3).
- Produces:
  - `type OptionInput = Pick<ScoreOption, 'id' | 'value' | 'label'>`
  - `masterApi.saveBandVersion(versionId, { effectiveFrom, bands, options: OptionInput[] })` — throws `ApiError('bands_invalid', 'Rentang tidak dapat disimpan', BandProblem[])` or `ApiError('options_invalid', 'Pilihan penilaian tidak dapat disimpan', OptionProblem[])`
  - `masterApi.updateBandDraft(versionId, bands, effectiveFrom, options: OptionInput[])`
  - `masterApi.updateOptionLabel(optionId: string, label: string)` — throws `ApiError('options_invalid', …, OptionProblem[])` or `ApiError('validation', 'Kalimat hanya dapat diubah langsung pada versi aktif.')`
  - `createBandDraft` / `discardBandDraft` also copy / remove options.

- [ ] **Step 1: Write the failing tests**

In `master.test.ts`, inside `describe('score bands …')`, add a helper at the top of the describe and update the two existing `saveBandVersion` calls to pass `options: opts('sbv-2')`:
```ts
  const opts = (versionId: string) =>
    getDb().scoreOptions.filter((o) => o.versionId === versionId);
```
Then add:
```ts
  it('refuses a version whose bands leave a predicate without a statement', async () => {
    // Fix the gap so bands are valid, then remove the only Cukup statement (value 2 → (1,9; 2,9]).
    const bands = getDb()
      .scoreBands.filter((b) => b.versionId === 'sbv-2')
      .map((b) => (b.predicate === 'cukup' ? { ...b, lowerExclusive: 1.9 } : b));
    const options = opts('sbv-2').filter((o) => o.value !== 2);
    await expect(
      masterApi.saveBandVersion('sbv-2', { effectiveFrom: '2028-01-01', bands, options }),
    ).rejects.toMatchObject({
      code: 'options_invalid',
      details: [{ kind: 'band-uncovered', predicate: 'cukup' }],
    });
  });

  it('copies statements into a new draft and removes them with the draft', async () => {
    await masterApi.discardBandDraft('sbv-2');
    expect(opts('sbv-2')).toEqual([]);
    const id = await masterApi.createBandDraft('2028-01-01');
    expect(opts(id).map((o) => [o.value, o.label])).toEqual(
      opts('sbv-1').map((o) => [o.value, o.label]),
    );
    expect(new Set(opts(id).map((o) => o.id)).size).toBe(5);
    expect(opts(id).some((o) => opts('sbv-1').some((x) => x.id === o.id))).toBe(false);
  });

  it('edits statement text of the active version only, with audit', async () => {
    const [first] = opts('sbv-1');
    await masterApi.updateOptionLabel(first!.id, 'Mitigasi belum berjalan');
    expect(opts('sbv-1')[0]!.label).toBe('Mitigasi belum berjalan');
    expect(getDb().audit.at(-1)).toMatchObject({
      action: 'ubah_kalimat_penilaian',
      entityType: 'ScoreOption',
      entityId: first!.id,
      before: { label: first!.label },
      after: { label: 'Mitigasi belum berjalan' },
    });
    await expect(masterApi.updateOptionLabel(first!.id, '  ')).rejects.toMatchObject({
      code: 'options_invalid',
    });
    await expect(
      masterApi.updateOptionLabel(first!.id, opts('sbv-1')[1]!.label.toUpperCase()),
    ).rejects.toMatchObject({ code: 'options_invalid' });
    await expect(
      masterApi.updateOptionLabel(opts('sbv-2')[0]!.id, 'Apa saja'),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('stores the saved statements sorted with order = rank', async () => {
    const bands = getDb()
      .scoreBands.filter((b) => b.versionId === 'sbv-2')
      .map((b) => (b.predicate === 'cukup' ? { ...b, lowerExclusive: 1.9 } : b));
    const options = [...opts('sbv-2')].reverse();
    await masterApi.saveBandVersion('sbv-2', { effectiveFrom: '2028-01-01', bands, options });
    expect(opts('sbv-2').map((o) => [o.value, o.order])).toEqual([
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
    ]);
  });
```
Check `audit` field names against `writeAudit` / an existing audit assertion in this file and adjust `action`/`entityType` keys if the stored shape differs.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data/api/master.test.ts`
Expected: FAIL (`options_invalid` never thrown, `updateOptionLabel` not a function, options not copied).

- [ ] **Step 3: Implement**

In `master.ts`: import `sortOptions, validateBands, validateOptions, type BandProblem` from `@/domain/scoreBands`; add `ScoreOption` to the type import. Above `masterApi`:
```ts
export type OptionInput = Pick<ScoreOption, 'id' | 'value' | 'label'>;

const withVersion = (options: OptionInput[], versionId: string): ScoreOption[] =>
  sortOptions(options).map((o, i) => ({ ...o, label: o.label.trim(), versionId, order: i + 1 }));
```
`createBandDraft` — inside `mutateDb`, after copying bands:
```ts
        d.scoreOptions.push(
          ...d.scoreOptions
            .filter((o) => o.versionId === active.id)
            .map((o) => ({ ...o, id: newId('so'), versionId: id })),
        );
```
`saveBandVersion` — patch type gains `options: OptionInput[];`. After the bands check:
```ts
      const optionProblems = validateOptions(patch.options, patch.bands);
      if (optionProblems.length)
        throw new ApiError('options_invalid', 'Pilihan penilaian tidak dapat disimpan', optionProblems);
```
inside `mutateDb` after replacing bands:
```ts
        d.scoreOptions = d.scoreOptions.filter((o) => o.versionId !== versionId);
        d.scoreOptions.push(...withVersion(patch.options, versionId));
```
and add `options: patch.options` to the audit `after` object.
`updateBandDraft(versionId, bands, effectiveFrom, options: OptionInput[])` — inside the `draft` branch:
```ts
        d.scoreOptions = d.scoreOptions.filter((o) => o.versionId !== versionId);
        d.scoreOptions.push(...withVersion(options, versionId));
```
(Draft autosave stores options as typed, including invalid ones; `withVersion` keeps NaN values sorted last — acceptable for a draft.)
`discardBandDraft` — add `d.scoreOptions = d.scoreOptions.filter((o) => o.versionId !== versionId);`.
New method after `updateActiveGuidance`:
```ts
  /** Statement text of the active version (PRD v2.8); values change only through a new version. */
  updateOptionLabel: (optionId: string, label: string) =>
    call(() => {
      const actor = requireActor([14]);
      const db = getDb();
      const option = db.scoreOptions.find((o) => o.id === optionId);
      const version = db.scoreBandVersions.find((v) => v.id === option?.versionId);
      if (!option || version?.status !== 'active')
        throw new ApiError('validation', 'Kalimat hanya dapat diubah langsung pada versi aktif.');
      const siblings = db.scoreOptions
        .filter((o) => o.versionId === option.versionId)
        .map((o) => (o.id === optionId ? { ...o, label } : o));
      const problems = validateOptions(
        siblings,
        db.scoreBands.filter((b) => b.versionId === option.versionId),
      ).filter((p) => p.optionId === optionId);
      if (problems.length)
        throw new ApiError('options_invalid', 'Kalimat tidak dapat disimpan', problems);
      mutateDb((d) => {
        const o = d.scoreOptions.find((x) => x.id === optionId)!;
        audit(d, actor, 'ubah_kalimat_penilaian', 'ScoreOption', optionId, { label: o.label }, {
          label: label.trim(),
        });
        o.label = label.trim();
      });
    }),
```
Note: the duplicate-label test passes the label upper-cased; `validateOptions` flags the *later* option in iteration order. Because `siblings` keeps seed order, an edit of option 0 to option 1's label flags option 1, not 0. Make the check order-independent by moving the edited option first: `const siblings = [ { ...option, label }, ...db.scoreOptions.filter((o) => o.versionId === option.versionId && o.id !== optionId) ];`.

`ScoreBandsPage.tsx` (temporary until Task 8): in `persistDraft` pass `db.scoreOptions.filter((o) => o.versionId === version.id)` as the 4th argument; in `save` pass `options: db.scoreOptions.filter((o) => o.versionId === version.id)`; in the `toast.error` guard also skip `options_invalid`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/data/api/master.test.ts src/pages/master/master.test.tsx` then `npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/data/api/master.ts src/data/api/master.test.ts src/pages/master/ScoreBandsPage.tsx
git commit -m "Version score options with score bands"
```

---

### Task 5: Assessment — dropdown entry, option validation, display cells

**Files:**
- Modify: `frontend/src/domain/rules/assessment.ts:36-53`
- Modify: `frontend/src/data/api/assessment.ts` (`CellView` ~67, `AssessmentView` ~114, `buildAssessment` ~171-414, `saveCell` ~793)
- Modify: `frontend/src/components/ScoreInput/ScoreInput.tsx`, `ScoreInput.css`
- Modify: `frontend/src/pages/assessment/AssessmentPage.tsx`, `AssessmentRow.tsx`
- Test: `frontend/src/data/api/assessment.test.ts`, `frontend/src/data/api/flow.test.ts`, `frontend/src/data/api/admin.test.ts:242`, `frontend/src/pages/assessment/assessment.test.tsx`

**Interfaces:**
- Consumes: `optionFor`, `sortOptions`, `predicateFor` (Task 2); `DB.scoreOptions` (Task 3).
- Produces (in `domain/rules/assessment.ts`):
  - `optionsOf(db: DB, versionId: string | null): ScoreOption[]` (sorted)
  - `optionLabelOf(db: DB, versionId: string | null, score: number | null): string | null`
  - `type AssessmentDisplay = Omit<Assessment, 'score'> & { optionLabel: string | null }`
  - `toDisplay(db: DB, a: Assessment): AssessmentDisplay`
- Produces (in `data/api/assessment.ts`):
  - `CellView.assessment: AssessmentDisplay | null`, `CellView.selectedValue: number | null` (own cell only)
  - `AssessmentView.options: ScoreOptionItem[]`, `AssessmentView.guidance: { predicate: Predicate; guidance: string }[]` (replaces `bands`)
- Produces (component): `interface ScoreOptionItem { value: number; label: string; predicate: Predicate | null }`; `ScoreInput({ label, options, value, disabled, onCommit })`.

- [ ] **Step 1: Update API tests to option values and add the new expectations**

In `assessment.test.ts`, `flow.test.ts`, `admin.test.ts`, replace every `score: <n>` in `saveCell` calls with its snapped value: 2,4→3, 3,2→4, 2,6→3, 1,6→2, 1,8→2, 3,1→4, 1,9→2, 2,2→3. Keep `4.3` (still invalid). Replace assertions on `.assessment?.score` (e.g. `assessment.test.ts:215`) with the statement:
```ts
import pilihan from '@seed/pilihan_penilaian.json';
const label = (v: number) => pilihan.options.find((o) => o.value === v)!.label;
// …
expect(row.cells.find((c) => c.positionId === KEP)!.assessment?.optionLabel).toBe(label(2));
```
Change the expected error for the out-of-range save (`assessment.test.ts:43`) to `'Pilihan penilaian tidak dikenal.'` if it asserts the message. Add to `assessment.test.ts` (reuse the file's existing `rq`, `A1`, `KEP`, setup helpers):
```ts
  it('accepts only option values of the quarter version (PRD v2.8)', async () => {
    // Same setup as the first test in this file (Rafi on 18 Mar 2027 with ?data=sesuai state).
    await expect(
      assessmentApi.saveCell(rq('rr-a1-penyerapan'), A1, { score: 2.5 }),
    ).rejects.toMatchObject({ message: 'Pilihan penilaian tidak dikenal.' });
    await assessmentApi.saveCell(rq('rr-a1-penyerapan'), A1, { score: 0 });
    const view = buildAssessment(getDb(), 'usr-rafi', A1, 2027, 1, '2027-03-18T10:00');
    const own = view.rows.find((r) => r.risk.id === 'rr-a1-penyerapan')!.cells.find((c) => c.own)!;
    expect(own.selectedValue).toBe(0);
    expect(own.assessment?.optionLabel).toBe(label(0));
    expect(own.assessment?.predicate).toBe('kurang');
    expect('score' in own.assessment!).toBe(false);
    expect(view.progress.unscored).toBe(view.progress.total - view.progress.draft - view.progress.ready - view.progress.finalised);
    expect(view.options.map((o) => o.value)).toEqual([0, 1, 2, 3, 4]);
  });

  it('never exposes another assessor\'s number', async () => {
    const view = buildAssessment(getDb(), 'usr-andi', A1, 2027, 1, '2027-04-06T09:00');
    for (const row of view.rows)
      for (const c of row.cells.filter((x) => !x.own)) {
        expect(c.selectedValue).toBeNull();
        if (c.assessment) expect('score' in c.assessment).toBe(false);
      }
  });
```
Adjust the setup lines (`as(...)`, `at(...)`, reset with as-of) to match how the first test in the file prepares 18 Mar 2027; import `buildAssessment` and `getDb` if not yet imported.

- [ ] **Step 2: Update the page test**

In `pages/assessment/assessment.test.tsx` replace the first two tests' textbox interaction with the dropdown:
```ts
  it('shows the predicate after choosing a statement, with no numbers', async () => {
    setup('2027-03-18T09:00', true);
    renderPage('usr-rafi', 1);
    const select = await screen.findByRole('combobox', {
      name: /^Penilaian Lini 1 · PPK A-1 untuk Pemecahan kontrak/,
    });
    expect(within(select).getByRole('option', { name: '— Pilih penilaian —' })).toBeInTheDocument();
    expect(within(select).queryByText(/\d,\d/)).toBeNull();
    fireEvent.change(select, { target: { value: '3' } });
    expect(
      await within(select.closest('.score-input') as HTMLElement).findByText('Cukup Terkendali'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Pita skor/)).toBeNull();
    expect(screen.getByText('Dilakukan oleh Andi Wirawan')).toBeInTheDocument();
  });

  it('treats the 0 statement as scored for "Belum dinilai saja"', async () => {
    setup('2027-03-18T09:00', true);
    renderPage('usr-rafi', 1);
    const select = await screen.findByRole('combobox', { name: /untuk Pemecahan kontrak/ });
    fireEvent.change(select, { target: { value: '0' } });
    await waitFor(() =>
      expect(
        getDb().assessments.some(
          (a) => a.riskQuarterId === 'rq-rr-a1-pemecahan-q-2027-1' && a.score === 0,
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Belum dinilai saja' }));
    expect(screen.queryByRole('combobox', { name: /untuk Pemecahan kontrak/ })).toBeNull();
  });
```
In the existing finalise test replace the textbox `change`+`blur` with `fireEvent.change(select, { target: { value: '3' } })` on `findByRole('combobox', { name: /untuk Pemecahan kontrak/ })` and `a.score === 2.6` with `a.score === 3`. If `Toggle` does not render `role="switch"`, query it the way other tests in the repo do (`grep -rn "Belum dinilai saja\|getByRole('switch'" src`).

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/data/api/assessment.test.ts src/pages/assessment/assessment.test.tsx`
Expected: FAIL (no `selectedValue`, `options`, combobox).

- [ ] **Step 4: Rule helpers**

In `domain/rules/assessment.ts` add imports `optionFor, sortOptions` from `../scoreBands` and `Assessment, ScoreOption` types; after `predicateIn` add:
```ts
/** The statements of a band version in dropdown order (PRD v2.8). */
export function optionsOf(db: DB, versionId: string | null): ScoreOption[] {
  return sortOptions(db.scoreOptions.filter((o) => o.versionId === versionId));
}

export function optionLabelOf(db: DB, versionId: string | null, score: number | null): string | null {
  if (score === null) return null;
  return optionFor(score, optionsOf(db, versionId))?.label ?? null;
}

/** An assessment as users may see it: the statement replaces the number (PRD v2.8). */
export type AssessmentDisplay = Omit<Assessment, 'score'> & { optionLabel: string | null };

export function toDisplay(db: DB, a: Assessment): AssessmentDisplay {
  const { score, ...rest } = a;
  return { ...rest, optionLabel: optionLabelOf(db, a.scoreBandVersionId, score) };
}
```
Leave `validScore` exported only if still referenced after Step 5 (`grep -rn validScore src`); otherwise delete it and `SCORE_MIN/SCORE_MAX` if unused.

- [ ] **Step 5: Assessment API**

In `data/api/assessment.ts`:
- Imports: add `optionsOf, toDisplay, type AssessmentDisplay` from `@/domain/rules/assessment`, `optionFor, predicateFor` from `@/domain/scoreBands`, `Predicate` type; remove `validScore` and the now-unused `ScoreBand` type import.
- Add above `CellView`:
```ts
export interface ScoreOptionItem {
  value: number;
  label: string;
  predicate: Predicate | null;
}
```
- `CellView`: `assessment: AssessmentDisplay | null;` and add
```ts
  /** The viewer's own chosen value (dropdown key); null for every other column. */
  selectedValue: number | null;
```
- `AssessmentView`: replace `bands: ScoreBand[];` with
```ts
  options: ScoreOptionItem[];
  guidance: { predicate: Predicate; guidance: string }[];
```
- In `buildAssessment` cell mapping: `assessment: visible && a ? toDisplay(db, a) : null,` and `selectedValue: own && a ? a.score : null,`.
- Progress: replace `(ownCell.assessment.score !== null || ownCell.assessment.notRelevant)` with `(ownCell.selectedValue !== null || ownCell.assessment.notRelevant)`.
- Return object: replace the `bands: …` entry with
```ts
    ...(() => {
      const bands = db.scoreBands
        .filter((b) => b.versionId === bandVersion)
        .sort((a, b) => a.order - b.order);
      return {
        options: optionsOf(db, bandVersion).map((o) => ({
          value: o.value,
          label: o.label,
          predicate: predicateFor(o.value, bands),
        })),
        guidance: bands.map((b) => ({ predicate: b.predicate, guidance: b.guidance })),
      };
    })(),
```
(or compute `bands` in a `const` before `return` — preferred for readability).
- `saveCell`: replace the `validScore` check with
```ts
      if (
        patch.score !== undefined &&
        patch.score !== null &&
        !optionFor(patch.score, optionsOf(db, bandVersionFor(db, q)))
      )
        throw new ApiError('validation', 'Pilihan penilaian tidak dikenal.');
```
Run `npx tsc -b` and fix every other compile error inside `data/api/assessment.ts` that reads `.assessment.score` (use `selectedValue` for own cells).

- [ ] **Step 6: ScoreInput component**

Replace `components/ScoreInput/ScoreInput.tsx`:
```tsx
import { ChevronDown } from 'lucide-react';
import type { Predicate } from '@/domain/types';
import { PredicateBadge } from '../Chips/Chips';
import '../Form/Form.css';
import './ScoreInput.css';

export interface ScoreOptionItem {
  value: number;
  label: string;
  predicate: Predicate | null;
}

export interface ScoreInputProps {
  /** Accessible name, e.g. "Penilaian Lini 1 · PPK A-1 untuk [risiko]". */
  label: string;
  /** The quarter version's statements, worst to best (no numbers shown). */
  options: ScoreOptionItem[];
  value: number | null;
  disabled?: boolean;
  /** Called with the chosen option value, or null when "— Pilih penilaian —" is chosen. */
  onCommit: (value: number | null) => void;
}

/** ScoreInput (.pen Q0zcSS) — PRD v2.8: a statement dropdown; the predicate shows once chosen. */
export function ScoreInput({ label, options, value, disabled, onCommit }: ScoreInputProps) {
  const selected = value === null ? null : (options.find((o) => o.value === value) ?? null);
  return (
    <span className="score-input">
      <span className="control-wrap score-input__wrap">
        <select
          className="control control--select score-input__control"
          aria-label={label}
          disabled={disabled}
          value={selected ? String(selected.value) : ''}
          onChange={(e) => {
            const next = e.target.value === '' ? null : Number(e.target.value);
            if (next !== value) onCommit(next);
          }}
        >
          <option value="">— Pilih penilaian —</option>
          {options.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="control-wrap__icon" aria-hidden />
      </span>
      {selected?.predicate && <PredicateBadge predicate={selected.predicate} />}
    </span>
  );
}
```
Replace `ScoreInput.css`:
```css
.score-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.score-input__wrap {
  flex: 1 1 240px;
  min-width: 0;
}

.score-input__control {
  width: 100%;
  text-overflow: ellipsis;
}
```
Export `ScoreOptionItem` from `components/index.ts` next to `ScoreInput`, and make `data/api/assessment.ts` import the type from `@/components`? No — keep the API independent: define `ScoreOptionItem` in `data/api/assessment.ts` (Step 5) and have the component declare a structurally identical interface (as above). Do not import API types into components.

- [ ] **Step 7: Assessment pages**

`AssessmentRow.tsx`:
- `RowActions`: replace `predicateOf: …` with `options: ScoreOptionItem[];` (import the type from `@/data/api/assessment`).
- Editable cell:
```tsx
          <ScoreInput
            label={`Penilaian ${c.label} untuk ${riskLabel}`}
            options={actions.options}
            value={c.selectedValue}
            disabled={!!a?.notRelevant}
            onCommit={(score) => actions.saveCell(rqId, c.positionId, { score })}
          />
```
- Read-only branch: replace `) : a.score !== null ? (` … `</p>` with
```tsx
      ) : a.optionLabel !== null ? (
        <>
          <p className="acell__value">
            {(a.status === 'final' || c.frozen) && (
              <Lock className="acell__lock" aria-label="Dituntaskan" />
            )}
            {a.predicate && <PredicateBadge predicate={a.predicate} />}
          </p>
          <p className="acell__statement">{a.optionLabel}</p>
        </>
```
- Remove `formatScore` from the import if unused; remove the `Predicate` import if unused.
- Add to `pages/assessment/Assessment.css`:
```css
.acell__statement {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-default);
}
```
(check the token name used for body text in `Assessment.css` — e.g. `--text-default` or `--text-body` — and use the same one.)

`AssessmentPage.tsx`:
- `actions`: replace `predicateOf: (score) => predicateFor(score, view.bands),` with `options: view.options,`; drop the `predicateFor` import.
- "Belum dinilai saja" filter: replace `!c.assessment?.score &&` with `c.selectedValue === null &&`.
- Delete `bandsText`. Replace the `assess__bands` paragraph content with:
```tsx
          <p className="assess__bands">
            Skala versi {view.bandVersionNumber ?? '—'} · {view.options.length} pilihan penilaian{' '}
            <button type="button" className="text-link assess__guide" onClick={() => setGuide(true)}>
              <BookOpen aria-hidden /> Panduan skoring
            </button>
          </p>
```
- Guide slide-over: eyebrow `` `Skala versi ${view.bandVersionNumber ?? '—'}` ``; body:
```tsx
        <div className="guide">
          {view.guidance.map((g) => (
            <section key={g.predicate} className="guide__band">
              <PredicateBadge predicate={g.predicate} />
              <p>{g.guidance || 'Belum ada panduan untuk predikat ini.'}</p>
            </section>
          ))}
          <section className="guide__band">
            <p className="t-eyebrow">Pilihan penilaian</p>
            <ol className="guide__options">
              {view.options.map((o) => (
                <li key={o.value}>{o.label}</li>
              ))}
            </ol>
          </section>
        </div>
```
Import `PredicateBadge` from `@/components` if not imported; remove `formatScore`/`PREDICATE_LABEL` imports if now unused. Add `.guide__options { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }` to `Assessment.css`.
- Search the file for other `formatScore(` uses (finalise dialog etc.) and remove numbers there.

- [ ] **Step 8: Run tests, typecheck, lint**

Run: `npm run test` then `npx tsc -b` then `npm run lint`
Expected: all pass. `tsc` will still report errors in `board.ts`/`history.ts`/`HistoryPage.tsx` etc. only if they consumed `CellView`; they don't — if any error appears outside the files of this task, it belongs to Task 6, so fix it minimally here to keep the build green.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "Assess risks by choosing a statement"
```

---

### Task 6: Hide numbers in thread, history, home and Lembar

**Files:**
- Modify: `frontend/src/data/api/board.ts:228-236,405-450`, `frontend/src/pages/board/ThreadPage.tsx:495-505`
- Modify: `frontend/src/data/api/history.ts:22-30,95-120`, `frontend/src/pages/history/HistoryPage.tsx:290-340,430-445`
- Modify: `frontend/src/domain/rules/sheets.ts`, `frontend/src/pages/home/HomePage.tsx:360-372`
- Modify: `frontend/src/domain/rules/sheetPayload.ts`, `frontend/src/pages/sheets/SheetDocument.tsx:25-45,365-380`
- Test: `frontend/src/data/api/sheets.test.ts`, `frontend/src/data/api/home.test.ts`, `frontend/src/data/api/thread.test.ts`

**Interfaces:**
- Consumes: `toDisplay`, `AssessmentDisplay`, `optionLabelOf` (Task 5).
- Produces:
  - `AssessmentCell` (board): `score` removed, `optionLabel: string | null` added.
  - `ChipView.assessment: AssessmentDisplay | null`.
  - `MutuCell`: `{ predicate; count; opened }` (no `average`).
  - `SheetAssessorValue.optionLabel: string | null` (payload keeps `score` for recomputation; never rendered).
  - `PayloadMutu.rows[].cells[]`: `{ predicate; opened }` (no `average`).

- [ ] **Step 1: Write the failing tests**

`sheets.test.ts` — add:
```ts
  it('stores the statement in the payload so a frozen copy keeps it (INV-22)', async () => {
    const before = buildSheetPayload(getDb(), 'pos-ppk-a1', q1(), AT);
    const v = before.risks.find((r) => r.riskId === 'rr-a1-penyerapan')!.l1;
    expect(v.optionLabel).toBe(label(3));
    act(() => useSession.getState().signIn('usr-nur'));
    const option = getDb().scoreOptions.find((o) => o.versionId === 'sbv-1' && o.value === 3)!;
    await masterApi.updateOptionLabel(option.id, 'Kalimat baru');
    expect(before.risks.find((r) => r.riskId === 'rr-a1-penyerapan')!.l1.optionLabel).toBe(label(3));
    const after = buildSheetPayload(getDb(), 'pos-ppk-a1', q1(), AT);
    expect(after.risks.find((r) => r.riskId === 'rr-a1-penyerapan')!.l1.optionLabel).toBe('Kalimat baru');
    expect(mutuFromPayload(before).rows[0]!.cells[0]).not.toHaveProperty('average');
  });
```
(add imports: `pilihan` json + `label` helper as in Task 5, `masterApi` from `./master`, `act`, `useSession` — mirror imports used by other API tests.) Also assert a seeded frozen snapshot keeps labels: `expect(getDb().snapshots.find((s) => s.trigger === 'auto_freeze')!.payload.risks.some((r) => r.l1.optionLabel !== null)).toBe(true)` — check `PrintSnapshot` field names in `domain/types.ts` first.

`home.test.ts` — add `expect(ka.cells[0]).not.toHaveProperty('average');`.

`thread.test.ts` — add one assertion where the test reads a thread view's quarter cards (find with `grep -n "visible" src/data/api/thread.test.ts`; if none, add a test that loads the PPK A-1 thread for `rr-a1-penyerapan` as `usr-andi` at `2027-04-06T09:00` using the same call the existing tests use):
```ts
    for (const card of view.quarterCards)
      for (const cell of card.visible) expect(cell).not.toHaveProperty('score');
```
(use the actual property name of the card list in `ThreadView`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data/api/sheets.test.ts src/data/api/home.test.ts src/data/api/thread.test.ts`
Expected: FAIL.

- [ ] **Step 3: Board card**

`data/api/board.ts`: in `AssessmentCell` replace `score: number | null;` with `optionLabel: string | null;`. In `card()`: the empty own cell uses `optionLabel: null`; the visible cell uses `optionLabel: optionLabelOf(db, a.scoreBandVersionId, a.score),` (import `optionLabelOf`). `ThreadPage.tsx` ~499: replace
```tsx
                ) : a.score !== null && a.predicate ? (
                  <>
                    <span className="t-mono qcard__score">{formatScore(a.score)}</span>
                    <PredicateBadge predicate={a.predicate} />
                  </>
```
with
```tsx
                ) : a.optionLabel !== null && a.predicate ? (
                  <span className="qcard__statement">
                    <PredicateBadge predicate={a.predicate} />
                    <span>{a.optionLabel}</span>
                  </span>
```
Remove `formatScore` from the import if unused. Add to the thread CSS file that defines `.qcard__value` (`grep -rn "qcard__value" src/pages/board`):
```css
.qcard__statement {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  text-align: right;
}
```

- [ ] **Step 4: History**

`data/api/history.ts`: `ChipView.assessment: AssessmentDisplay | null;`; in `cellFor` wrap both assignments: `assessment: l1 ? toDisplay(db, l1) : null,` and `assessment: a ? toDisplay(db, a) : null,`. Remove the `Assessment` type import if unused.
`HistoryPage.tsx` `MiniChip`: replace the `chip.kind === 'score' && a?.score …` block with
```tsx
      {chip.kind === 'score' && pred && <span className="mchip__pred">{SHORT[pred]}</span>}
```
`CellDetail` score paragraph:
```tsx
              <>
                <p className="cdetail__score">
                  {a?.predicate && <PredicateBadge predicate={a.predicate} />}
                  {r?.result === 'sesuai' && <MarkerBadge kind="sesuai" />}
                  {r?.result === 'tidak_sesuai' && <MarkerBadge kind="tidak-sesuai" />}
                </p>
                {a?.optionLabel && <p className="cdetail__note">{a.optionLabel}</p>}
              </>
```
Mutu summary (~435): replace `c.average !== null ? (<>…formatScore(c.average)…</>)` with `c.predicate ? (<span className={`mchip__pred mchip--${c.predicate}`}>{SHORT[c.predicate]}</span>)`, keeping the existing else-branch. Remove `formatScore` import if unused.

- [ ] **Step 5: Lembar Mutu rule + Home**

`domain/rules/sheets.ts`: remove `average` from `MutuCell` (keep doc comment: `/** null + opened=false → "Menunggu"; null + opened=true → "Tidak ada nilai". The average is internal (PRD v2.8). */` on `predicate`); in the cell builder keep computing `average` locally and return `{ predicate: average === null ? null : predicateIn(db, quarter, average), count: scores.length, opened: relevant.length > 0 }`.
`HomePage.tsx` ~365: replace the `c.average !== null ? (<>…</>)` block with
```tsx
                {c.predicate ? (
                  <span className={`mchip__pred mchip--${c.predicate}`}>{SHORT[c.predicate]}</span>
                ) : (
```
Remove `formatScore` import if unused.

- [ ] **Step 6: Sheet payload + document**

`domain/rules/sheetPayload.ts`:
- `SheetAssessorValue`: add `/** The chosen statement, frozen with the payload (INV-22). */ optionLabel: string | null;` and change the `score` comment to `/** Kept only to recompute Lembar Mutu after masking; never rendered (PRD v2.8). */`.
- In the builder, after `const bands = …` add `const label = (s: number | null) => optionLabelOf(db, bandVersion, s);` (import `optionLabelOf` from `./assessment`). L1: `optionLabel: anyOpen && l1a?.status === 'final' ? label(l1a.score) : null,`. Lini 3: `optionLabel: x?.status === 'final' ? label(x.score) : null,`.
- `maskedValue`: add `optionLabel: null,`.
- `PayloadMutu` cells type: `{ predicate: Predicate | null; opened: boolean }`; in `mutuFromPayload` return `{ predicate: average === null ? null : predicateFor(average, p.bands), opened: values.length > 0 }`.
- Any other place constructing `SheetAssessorValue` (`grep -n "notAssessed:" src/domain/rules/sheetPayload.ts`) gets `optionLabel: null`.

`SheetDocument.tsx` `value()`: replace the `if (v.score === null)` line and the returned JSX with
```tsx
  if (v.optionLabel === null || !v.predicate) return <span className="doc__muted">—</span>;
  return (
    <span>
      {PREDICATE_LABEL[v.predicate]} — {v.optionLabel}
      {v.result === 'sesuai'
        ? ' · Sesuai'
        : v.result === 'tidak_sesuai'
          ? ' · Tidak Sesuai'
          : v.result === 'incomparable'
            ? ' · Tidak dapat dibandingkan'
            : ''}
    </span>
  );
```
Mutu table (~372): replace the `c.average !== null ? (<>…</>)` block with `c.predicate ? (<>{PREDICATE_LABEL[c.predicate]}</>)`, keeping the else-branch. Then `grep -n "Rata-rata\|rata-rata\|Skor" src/pages/sheets/*.tsx` and change any column/caption text "Rata-rata"/"Skor" to "Predikat". Remove `formatScore` import if unused.

Seeded snapshots: `data/seed/index.ts` builds them with `buildSheetPayload`, so they pick up `optionLabel` automatically — verify with the snapshot assertion from Step 1.

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `npm run test`, `npx tsc -b`, `npm run lint`
Expected: PASS. Then confirm no number rendering is left in user pages:
```bash
grep -rn "formatScore" src/pages | grep -v "src/pages/master/"
```
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "Hide numeric scores outside the score scale page"
```

---

### Task 7: Audit trail shows statements

**Files:**
- Modify: `frontend/src/data/api/insights.ts:264-340`
- Test: `frontend/src/data/api/admin.test.ts:232-260`

**Interfaces:**
- Consumes: `optionLabelOf` (Task 5), `REDACTED` (existing).
- Produces: `labelScores(db: DB, entry: AuditLog): AuditLog` (non-exported helper) applied in `buildAudit` when `original === false`.

- [ ] **Step 1: Write the failing test**

In `admin.test.ts` inside `describe('metrics and audit …')` add (mirror the setup of `'redacts blind scores in audit values'`, which saves `{ score: 3 }` after Task 5):
```ts
  it('shows the statement instead of the number once the assessment is visible', async () => {
    // Seeded finalise entry for rr-a1-penyerapan TW I (score 3) is visible to the audit reader.
    const rows = await insightsApi.audit({ entityType: 'Assessment' }, false); // use the real API name
    const finalised = rows.find((r) => (r.after as { status?: string } | null)?.status === 'final')!;
    expect((finalised.after as { score: unknown }).score).toBe(label(3));
    const original = await insightsApi.audit({ entityType: 'Assessment' }, true);
    expect(
      (original.find((r) => r.id === finalised.id)!.after as { score: unknown }).score,
    ).toBe(3);
  });
```
Look up the real audit API call and signature used by the existing redaction test and use it verbatim; add the `pilihan`/`label` helper import. Keep the existing redaction test: blind values must still read as `REDACTED`, not a statement.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data/api/admin.test.ts`
Expected: FAIL (score is `3`).

- [ ] **Step 3: Implement**

In `insights.ts` (import `optionLabelOf` from `@/domain/rules/assessment`):
```ts
/** PRD v2.8: numbers in Assessment before/after read as the chosen statement. */
function labelScores(db: DB, entry: AuditLog): AuditLog {
  if (entry.entityType !== 'Assessment') return entry;
  const version = db.assessments.find((a) => a.id === entry.entityId)?.scoreBandVersionId ?? null;
  const swap = (v: unknown): unknown => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const o = v as Record<string, unknown>;
    if (typeof o.score !== 'number') return v;
    return { ...o, score: optionLabelOf(db, version, o.score) ?? o.score };
  };
  return { ...entry, before: swap(entry.before), after: swap(entry.after) };
}
```
In `buildAudit`'s `.map`, change `...redact(db, viewerId, e, at, original),` to
```ts
      ...(original ? e : labelScores(db, redact(db, viewerId, e, at, false))),
```
(Redaction runs first, so `REDACTED` strings are left untouched because `typeof o.score !== 'number'`.) Check `AuditLog.before/after` types and cast as the file already does.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/data/api/admin.test.ts` then `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/api/insights.ts src/data/api/admin.test.ts
git commit -m "Show score statements in the audit trail"
```

---

### Task 8: Skala Penilaian — "Pilihan penilaian" card

**Files:**
- Create: `frontend/src/pages/master/ScoreOptionsCard.tsx`
- Modify: `frontend/src/pages/master/ScoreBandsPage.tsx`, `frontend/src/pages/master/Master.css`
- Test: `frontend/src/pages/master/master.test.tsx`

**Interfaces:**
- Consumes: `masterApi.updateBandDraft(versionId, bands, effectiveFrom, options)`, `masterApi.saveBandVersion(…, { options })`, `masterApi.updateOptionLabel` (Task 4); `validateOptions`, `predicateFor`, `sortOptions`, `OptionProblem` (Task 2).
- Produces: `ScoreOptionsCard` props:
```ts
interface ScoreOptionsCardProps {
  status: ScoreBandVersion['status'];
  options: ScoreOption[];
  bands: ScoreBand[];
  problems: OptionProblem[];
  /** Draft edits (local state); persisted by the page on blur. */
  onChange: (next: ScoreOption[]) => void;
  onPersist: () => void;
  /** Active version: commit one statement's text. */
  onLabelCommit: (optionId: string, label: string) => void;
}
```

- [ ] **Step 1: Write the failing UI tests**

Append to `describe('Skala Penilaian')` in `master.test.tsx`:
```ts
  it('lists the draft statements and reports the uncovered predicate', async () => {
    renderPage(<ScoreBandsPage />);
    expect(screen.getByRole('table', { name: 'Pilihan penilaian' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mitigasi belum dilaksanakan')).toBeInTheDocument();
    expect(
      screen.getByText('Predikat Cukup Terkendali belum punya kalimat.'),
    ).toBeInTheDocument();
  });

  it('adds a statement in the draft and shows its predicate', async () => {
    renderPage(<ScoreBandsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Pilihan' }));
    const values = screen.getAllByRole('textbox', { name: /^Nilai pilihan/ });
    const last = values.at(-1)!;
    fireEvent.change(last, { target: { value: '2,5' } });
    fireEvent.blur(last);
    await waitFor(() =>
      expect(
        useDb.getState().db.scoreOptions.filter((o) => o.versionId === 'sbv-2'),
      ).toHaveLength(6),
    );
    expect(screen.queryByText('Predikat Cukup Terkendali belum punya kalimat.')).toBeNull();
  });

  it('allows only text edits on the active version', async () => {
    renderPage(<ScoreBandsPage />);
    fireEvent.change(screen.getByLabelText('Versi'), { target: { value: 'sbv-1' } });
    expect(screen.getAllByRole('textbox', { name: /^Nilai pilihan/ })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tambah Pilihan' })).toBeDisabled();
    expect(
      screen.getByText('Ubah nilai atau jumlah pilihan lewat Buat Versi Baru.'),
    ).toBeInTheDocument();
    const first = screen.getAllByRole('textbox', { name: /^Kalimat pilihan/ })[0]!;
    fireEvent.change(first, { target: { value: 'Mitigasi belum berjalan' } });
    fireEvent.blur(first);
    await waitFor(() =>
      expect(
        useDb.getState().db.scoreOptions.find((o) => o.id === 'so-sbv-1-0')!.label,
      ).toBe('Mitigasi belum berjalan'),
    );
  });
```
The new row in test 2 starts with an empty label, so the card will also show "Kalimat wajib diisi." — that is expected; do not assert its absence.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/pages/master/master.test.tsx`
Expected: FAIL (no table "Pilihan penilaian").

- [ ] **Step 3: Create `ScoreOptionsCard.tsx`**

```tsx
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, PredicateBadge } from '@/components';
import { predicateFor, type OptionProblem } from '@/domain/scoreBands';
import {
  PREDICATE_LABEL,
  type ScoreBand,
  type ScoreBandVersion,
  type ScoreOption,
} from '@/domain/types';
import { formatScore, parseScore } from '@/lib/format';
import { newId } from '@/data/local/writers';

const ROW_ERROR: Record<Exclude<OptionProblem['kind'], 'band-uncovered'>, string> = {
  'empty-label': 'Kalimat wajib diisi.',
  'duplicate-label': 'Kalimat sudah dipakai pilihan lain.',
  'duplicate-value': 'Nilai sudah dipakai pilihan lain.',
  'out-of-range': 'Nilai 0,0–4,0 dengan satu desimal.',
};

export function optionProblemSummary(problems: OptionProblem[]): string[] {
  return problems
    .filter((p) => p.kind === 'band-uncovered')
    .map((p) => `Predikat ${PREDICATE_LABEL[p.predicate!]} belum punya kalimat.`);
}

export interface ScoreOptionsCardProps {
  status: ScoreBandVersion['status'];
  options: ScoreOption[];
  bands: ScoreBand[];
  problems: OptionProblem[];
  onChange: (next: ScoreOption[]) => void;
  onPersist: () => void;
  onLabelCommit: (optionId: string, label: string) => void;
}

/** "Pilihan penilaian" (PRD v2.8, FR-MST-007): statements and their hidden values per version. */
export function ScoreOptionsCard({
  status,
  options,
  bands,
  problems,
  onChange,
  onPersist,
  onLabelCommit,
}: ScoreOptionsCardProps) {
  const [rawValues, setRawValues] = useState<Record<string, string>>({});
  const draft = status === 'draft';
  const labelEditable = draft || status === 'active';
  const rowErrors = (id: string) =>
    problems.filter((p) => p.optionId === id).map((p) => ROW_ERROR[p.kind as keyof typeof ROW_ERROR]);
  const update = (id: string, patch: Partial<ScoreOption>) =>
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  return (
    <Card title="Pilihan penilaian (tampil sebagai dropdown di halaman penilaian)">
      <p className="opt-help">
        Pengguna hanya melihat kalimat. Nilai dipakai untuk menentukan predikat dan tidak
        ditampilkan.
      </p>
      <div className="opt-table" role="table" aria-label="Pilihan penilaian">
        <div role="row" className="opt-table__head">
          <span role="columnheader">Kalimat</span>
          <span role="columnheader">Nilai</span>
          <span role="columnheader">Predikat</span>
          <span role="columnheader">
            <span className="sr-only">Tindakan</span>
          </span>
        </div>
        {options.map((o, i) => {
          const errors = rowErrors(o.id);
          const predicate = Number.isFinite(o.value) ? predicateFor(o.value, bands) : null;
          return (
            <div
              role="row"
              key={o.id}
              className={['opt-table__row', errors.length > 0 && 'is-invalid']
                .filter(Boolean)
                .join(' ')}
            >
              <span role="cell">
                <input
                  className="control"
                  aria-label={`Kalimat pilihan ${i + 1}`}
                  disabled={!labelEditable}
                  value={o.label}
                  onChange={(e) => update(o.id, { label: e.target.value })}
                  onBlur={(e) => (draft ? onPersist() : onLabelCommit(o.id, e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
                {errors.map((m) => (
                  <span key={m} className="field__error">
                    {m}
                  </span>
                ))}
              </span>
              <span role="cell">
                <input
                  className="control t-mono opt-table__value"
                  aria-label={`Nilai pilihan ${i + 1}`}
                  disabled={!draft}
                  value={rawValues[o.id] ?? formatScore(o.value)}
                  onChange={(e) => {
                    setRawValues((s) => ({ ...s, [o.id]: e.target.value }));
                    update(o.id, { value: parseScore(e.target.value) ?? Number.NaN });
                  }}
                  onBlur={() => {
                    setRawValues((s) => {
                      const { [o.id]: _drop, ...rest } = s;
                      return rest;
                    });
                    onPersist();
                  }}
                />
              </span>
              <span role="cell">
                {predicate ? (
                  <PredicateBadge predicate={predicate} />
                ) : (
                  <span className="field__error">Di luar pita</span>
                )}
              </span>
              <span role="cell">
                {draft && (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    aria-label={`Hapus pilihan ${i + 1}`}
                    onClick={() => {
                      onChange(options.filter((x) => x.id !== o.id));
                      onPersist();
                    }}
                  >
                    <Trash2 aria-hidden />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="opt-actions">
        <Button
          variant="secondary"
          icon={Plus}
          disabled={!draft}
          onClick={() =>
            onChange([
              ...options,
              {
                id: newId('so'),
                versionId: options[0]?.versionId ?? '',
                value: Number.NaN,
                label: '',
                order: options.length + 1,
              },
            ])
          }
        >
          Tambah Pilihan
        </Button>
        {status === 'active' && (
          <span className="opt-help">Ubah nilai atau jumlah pilihan lewat Buat Versi Baru.</span>
        )}
      </div>
    </Card>
  );
}
```
Notes for the implementer:
- `onPersist` after delete must persist the *new* list: the page's `onPersist` must read the latest state. Implement in the page with a ref (`optionsRef.current`) updated on every `setOptions`, or make `onChange` return the next list and call `persistDraft(next)` directly. Pick the ref approach and keep it in the page.
- If `newId` is not exported from `@/data/local/writers` for UI use (pages must not touch the data layer directly, CLAUDE.md §4), generate ids in the page with `crypto.randomUUID()` instead and pass an `onAdd` callback; prefer that and drop the `newId` import.
- If the `_drop` destructuring trips ESLint `no-unused-vars`, copy the object and `delete` the key instead.
- Use `sr-only` only if that utility class exists (`grep -rn "\.sr-only" src/styles`); otherwise use the repo's visually-hidden class.

- [ ] **Step 4: Wire into the page**

In `ScoreBandsPage.tsx`:
- Imports: `validateOptions, sortOptions` from `@/domain/scoreBands`; `ScoreOption` type; `ScoreOptionsCard, optionProblemSummary` from `./ScoreOptionsCard`; `useRef`.
- State next to `bands`:
```ts
  const storedOptions = useMemo(
    () => sortOptions(db.scoreOptions.filter((o) => o.versionId === version.id)),
    [db.scoreOptions, version.id],
  );
  const [options, setOptionsState] = useState(storedOptions);
  const optionsRef = useRef(storedOptions);
  const setOptions = (next: ScoreOption[]) => {
    optionsRef.current = next;
    setOptionsState(next);
  };
```
  and in the existing reset `useEffect` add `setOptions(storedOptions);` (add `storedOptions` to its deps).
- `const optionProblems = validateOptions(options, bands);`
- `persistDraft = (next = bands, date = effectiveFrom) => masterApi.updateBandDraft(version.id, next, date, optionsRef.current);` — update existing callers (`persistDraft(bands)`, `persistDraft(bands, e.target.value)`) accordingly.
- `save`: pass `options` (sorted local state) and treat `options_invalid` like `bands_invalid` (no toast; inline alert shows it).
- After the existing draft error `InlineAlert`, add:
```tsx
      {isDraft && optionProblems.length > 0 && (
        <InlineAlert variant="error" title="Pilihan penilaian tidak dapat disimpan">
          {[
            ...optionProblemSummary(optionProblems),
            ...(optionProblems.some((p) => p.optionId)
              ? ['Periksa kalimat dan nilai yang ditandai merah.']
              : []),
          ].join(' ')}
        </InlineAlert>
      )}
```
- Render the card between the band `Card` and the guidance `Card`:
```tsx
      <ScoreOptionsCard
        status={version.status}
        options={options}
        bands={bands}
        problems={isDraft ? optionProblems : []}
        onChange={setOptions}
        onPersist={() => isDraft && void persistDraft()}
        onLabelCommit={(id, label) => {
          if (label === storedOptions.find((o) => o.id === id)?.label) return;
          masterApi
            .updateOptionLabel(id, label)
            .then(() => toast.success('Kalimat diperbarui'))
            .catch((e: Error) => {
              toast.error('Kalimat tidak dapat disimpan', e.message);
              setOptions(storedOptions);
            });
        }}
      />
```
- `BandPreview`: add prop `values: number[]` and render under the bar:
```tsx
      <div className="band-preview__markers" aria-hidden>
        {values.filter(Number.isFinite).map((v) => (
          <span key={v} className="band-preview__marker" style={{ left: `${(v / 4) * 100}%` }} />
        ))}
      </div>
```
  pass `values={options.map((o) => o.value)}`; extend the `aria-label` of `.band-preview` to `` `Pratinjau rentang 0,0 sampai 4,0 dengan ${options.length} pilihan penilaian` ``.
- Status chips: for the active version append `` ` · ${db.scoreOptions.filter((o) => o.versionId === v.id).length} pilihan` `` to the label.
- Subtitle: `"Pilihan penilaian dan rentang skor 0,0–4,0 menjadi predikat. Berversi; tepat satu versi aktif."`
- `ConfirmDialog` texts: `"Rentang, pilihan penilaian, dan panduan pada versi ini akan dihapus. Versi aktif tidak berubah."` and `"Draf menyalin rentang, pilihan penilaian, dan panduan versi aktif. Atur tanggal berlaku, lalu simpan."`

- [ ] **Step 5: CSS**

Append to `Master.css` (mirrors `.band-table`):
```css
.opt-help {
  font-size: 13px;
  color: var(--text-muted);
}

.opt-table {
  display: flex;
  flex-direction: column;
}

.opt-table__head,
.opt-table__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 200px 44px;
  align-items: start;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.opt-table__head {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  color: var(--text-muted);
}

.opt-table__row [role='cell'] {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.opt-table__row.is-invalid {
  background: var(--danger-bg);
}

.opt-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.band-preview__markers {
  position: relative;
  height: 10px;
}

.band-preview__marker {
  position: absolute;
  top: 1px;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 50%;
  background: var(--text-strong);
}

@media (max-width: 899px) {
  .opt-table__head {
    display: none;
  }

  .opt-table__row {
    grid-template-columns: 1fr 1fr 44px;
  }

  .opt-table__row [role='cell']:first-child {
    grid-column: 1 / -1;
  }
}
```
Check how `.band-table` handles < 900 px in this file and match its breakpoint syntax.

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npm run test`, `npx tsc -b`, `npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/master
git commit -m "Manage score options on the score scale page"
```

---

### Task 9: Notes, visual verification, final checks

**Files:**
- Modify: `CLAUDE.md` (§9 Tahap 10 notes; §5 "Pita skor aktif" bullet), `frontend/README.md`

**Interfaces:** none.

- [ ] **Step 1: CLAUDE.md**

- At the end of the "Catatan pascatahap" paragraph under Tahap 10, append:
```markdown
Penilaian dengan pilihan kalimat (keputusan pengguna 13 Okt 2026, PRD v2.8): penilai memilih kalimat dari dropdown (`ScoreInput`, daftar datar terburuk → terbaik, tanpa angka); `Assessment.score` tetap menyimpan nilai 0–4 dan predikat diturunkan dari pita. Entitas baru `ScoreOption` per versi skala, dikelola di kartu "Pilihan penilaian" pada `/master/skala-penilaian` (teks bisa disunting di versi aktif; nilai/jumlah lewat versi baru). Angka skor dan rata-rata tidak ditampilkan di mana pun kecuali halaman Skala Penilaian, ekspor CSV metrik, dan impor; jejak audit menampilkan kalimat (nilai asli lewat izin 24). Kalimat seed `docs/seed/pilihan_penilaian.json` masih draf ilustratif. Skor seed dipetakan ke nilai pilihan terdekat dalam predikat yang sama; akibatnya predikat Lembar Mutu Lini 1 Kinerja Anggaran TW I 2027 PPK A-1 berubah dari Cukup menjadi Terkendali dengan Baik. SCHEMA_VERSION 9.
```
- §5 bullet "Pita skor aktif": append ` Pilihan penilaian bawaan: 0, 1, 2 (Kurang), 3 (Cukup), 4 (Terkendali dengan Baik).`

- [ ] **Step 2: README**

In `frontend/README.md`, in the mockup-differences section, add: `ScoreInput (.pen Q0zcSS) kini dropdown kalimat (PRD v2.8), bukan kolom angka; baris "Pita skor" di halaman penilaian diganti "Skala versi n · m pilihan penilaian".` If the README mentions typing scores in a demo scenario, change it to choosing a statement.

- [ ] **Step 3: Full verification**

```bash
npm run build
```
```bash
npm run test
```
```bash
npm run lint
```
Expected: all pass, no warnings promoted to errors.

- [ ] **Step 4: Visual check (1440 and 390 px)**

Start `npx vite` in the background, then for each URL take an Edge headless screenshot at `--window-size=1440,2400` and a 390 px iframe screenshot (CLAUDE.md §7a):
- `/master/skala-penilaian?sebagai=usr-nur` (draft Versi 2: gap + "Predikat Cukup Terkendali belum punya kalimat."; switch to Versi 1: only Kalimat editable)
- `/jabatan/pos-ppk-a1/penilaian/2027/1?sebagai=usr-rafi&waktu=2027-03-18T09:00&data=sesuai` (dropdown, no numbers, guide slide-over)
- `/jabatan/pos-ppk-a1/penilaian/2027/1?sebagai=usr-andi` (opened comparison: statement + predicate)
- `/jabatan/pos-ppk-a1/riwayat?sebagai=usr-andi`, `/?sebagai=usr-andi`, `/jabatan/pos-ppk-a1/lembar/2027/1?sebagai=usr-andi`, `/jejak-audit?sebagai=usr-admin` (use the real Admin DKB user id from `data/seed/org.ts`)
Check: no `0,0`-style numbers outside the scale page, no horizontal scroll at 390 px, dropdown ≥44 px tall on mobile. Delete any temporary file put in `frontend/public/`.

- [ ] **Step 5: Commit**

```bash
git add ../CLAUDE.md README.md
git commit -m "Document statement-based assessment"
```

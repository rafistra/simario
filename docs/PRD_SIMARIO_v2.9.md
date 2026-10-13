# PRD — SIMARIO (Sistem Informasi Mitigasi Risiko Otorita IKN)

| | |
|---|---|
| **Version** | 2.9 (revision of v2.8 dated 13 October 2026) — collapsible sidebar, full-width content |
| **Date** | 13 October 2026 |
| **Author** | Direktorat Data dan Kecerdasan Buatan, Otorita IKN |
| **Status** | Ready for development — walkthrough with the process owner completed 11 October 2026 |
| **Product Owner** | Binsar H. Simanjuntak |

> **Language convention.** This document is written in English. All **user-facing copy** in the application — labels, messages, page titles, print output — is in formal Bahasa Indonesia and is quoted verbatim in this document. Code identifiers (models, fields, statuses) are English `snake_case`. Route paths are in Bahasa Indonesia for consistency with existing OIKN applications.

> **What v2.2 changes.** v2.1 rewrote accounts and roles. v2.2 rewrites the **flow**: the monthly submit-and-review cycle is replaced by an **annual register** whose risks live for the whole fiscal year as **discussion threads** shared by all three lines, with a **quarterly** assessment by Lini 1 and an independent assessment by Lini 3 that are compared automatically. Chapters 4–10 and 12 are new or rewritten; chapters 3 and 11 carry the v2.1 account model with adjustments. **v2.5** closes the findings of the re-review of v2.4 (viewer-dependent blindness for late directorates, holding rule wording, archiving, exclusions, comment attribution). **v2.4** resolved an independent end-to-end review (3 blockers, 12 major, 8 minor findings), mostly around blind assessment, Pokja, delegation, and fiscal-year transition. **v2.3** closed the gaps found in an earlier walk-through: finalising per risk, explanations per directorate, assessment windows, a hard archive limit, numbered print snapshots, obligation-based Home, Lini 3 window, and bulk import. See §1.12.

---

# 1. INTRODUCTION

## 1.1 Background

Otorita Ibu Kota Nusantara is required to operate an internal control system under Peraturan Pemerintah No. 60/2008 (SPIP), with the organisational structure established by Peraturan Kepala Otorita IKN No. 1/2022. It follows the three lines model: first line as risk owner, second line as compliance oversight, third line as internal audit.

The Three Lines Model meeting of 4 August 2026 directed risk management to focus on budget administration — from planning through accountability — across three risk types: budget performance, non-compliance, and fraud. The Rapim concept deck of 12 October 2026 extends the first line to four risk owner classes — KPA/Kasatker, PPK, Pokja Pemilihan, and Pejabat Pengadaan — gives each its own stages, catalogues example risks and mitigations for all four, and settles who sits on the second and third lines.

Today the entire process is done manually in spreadsheets and word processor documents. The same risk is worded differently across work units and cannot be consolidated; assessments across periods cannot be compared; coordination between the lines happens in meetings and chat groups and leaves no record; and leadership has no current picture without requesting a manual recap.

Some institutional uncertainty remains — which unit owns reference data, the official output format under Kepka 47, and the scoring guidance behind the 0–4 assessment scale. SIMARIO treats that uncertainty as **configuration data**, not as rules written into code.

## 1.2 What This Product Is — and Is Not

**SIMARIO is a coordination and compliance record.** It standardises the annual risk register, gives all three lines one shared place to discuss each risk, records the quarterly assessments of the first and third lines, compares them, and turns the activity into the Lembar Komunikasi Tiga Lini and the Lembar Mutu. That is its job.

**SIMARIO is not a risk analytics system.** Objective 1 targets 80% of register entries coming from central templates. A template-driven register optimises for *consolidation*, not for surfacing novel risk, and this product deliberately chooses consolidation.

Two consequences govern every scope decision:

1. **The primary design constraint is time-on-task, not analytical depth.** Anything that reduces the quarterly effort of a risk owner is high priority.
2. **The system must never make dishonesty the cheapest path.** See §2.6.

## 1.3 Product Objectives

| No | Objective | Success Indicator |
|---|---|---|
| 1 | Standardise risk identification through central templates | At least 80% of register entries originate from a template rather than a custom addition |
| 2 | Make the three lines actually coordinate | At least 80% of risks assessed in a quarter (RB-REG-006) carry at least one Lini 1 "Langkah" comment in each quarter |
| 3 | Improve evidence completeness for self assessment | At least 90% of finalised Lini 1 assessments carry at least one supporting file |
| 4 | Surface recurring uncontrolled risk | Every risk rated Kurang Terkendali by Lini 3 in two consecutive quarters is flagged and notified automatically |
| 5 | Provide an auditable trail | Every data change recorded with timestamp, actor, acting position, and before/after values |
| 6 | Give risk owners a view of their own risk over time | Cross-quarter and cross-year assessment history available without requesting a recap |
| 7 | Absorb institutional change without redeployment | Roles, permissions, position types, stages, Data Umum forms, quarter deadlines, and score bands all changeable through configuration |
| 8 | **Keep the quarterly burden small enough that people actually comply** | A returning risk owner finalises one quarterly self assessment in **under 30 minutes** median, measured by instrumented time-on-page |
| 9 | Make Lini 1 and Lini 3 judgements comparable | Alignment rate (Sesuai ÷ compared) reported per quarter; no target in v1.0 — the baseline is the finding |

> Objective 2 replaces v2.0's submission-to-decision cycle time, which no longer exists. Objective 8's figure moves from 10 minutes per monthly stage register to 30 minutes per quarterly assessment of the whole register; it is an assumption to be re-measured in the first live quarter.

**Measurement.** Objectives 1–4, 8, and 9 are computable from application data and exposed on a read-only metrics page (FR-ADM-011).

## 1.4 Users, Positions, and Roles

SIMARIO has no public access. Every page requires authentication.

Access rests on three separate ideas, and the rest of this document keeps them apart:

| Concept | Answers | Managed by |
|---|---|---|
| **Position** (*Jabatan*) | *Where* is the work done? A seat on one of the three lines, e.g. "PPK A-1" or "Direktorat Kepatuhan". The position outlives whoever sits in it | Reference Data Manager |
| **Holding** | *Who* works on that seat? Either as **Pejabat** (appointed by decree) or as **Operator** (optionally delegated by the Pejabat) | Superadmin (Pejabat); the Pejabat themself (Operator) |
| **Role** (*Peran*) | *What* may the user do, and over how wide a data scope? A dynamic set of permissions | Superadmin |

### 1.4.1 Positions per Line

Source: Rapim concept deck, 12 October 2026.

| Line | Position type | Held by | What they do in SIMARIO | More than one Pejabat? |
|---|---|---|---|---|
| **Lini 1** — risk owner | KPA/Kasatker | KPA/Kasatker of a work unit | Builds the annual register, posts "Langkah" on threads, self-assesses each risk quarterly, explains mismatches | No |
| | PPK | Commitment Making Officer, e.g. PPK A-1, PPK A-2 | Same | No |
| | Pokja Pemilihan | Members of a procurement selection working group | Same | **Yes** — every member is a Pejabat; exactly one is the **Pengisi** |
| | Pejabat Pengadaan | Procurement Officer | Same | No |
| **Lini 2** — coordination | Penanggung Jawab Pemantauan | A Director/Head of Bureau appointed ad hoc | Gives solutions, advice, and input on threads. **Does not assess** | No |
| | Unit Pendukung Pemantauan | Biro Keuangan, BMN, ADP and Biro POKS (budget performance); UKPBJ (procurement) | Same | No |
| **Lini 3** — quality assurance | Penjamin Mutu | Direktorat Kepatuhan; Direktorat Pengawasan dan Audit Internal | Comments on threads; **each** directorate independently assesses every risk quarterly | No |

Rules:

- Position types are reference data. The seven above ship as built-in; further types can be added (FR-MST-008). Only Lini 1 types carry stages, templates, and a Data Umum form; a Lini 1 type is what this document calls a **risk owner type**.
- **Lini 2 coordinates; it never judges.** Its contribution is the content of its comments, which become Section B of the Lembar Komunikasi.
- **Lini 3 covers everything.** Every Lini 3 position assesses every Lini 1 position. No assignment is needed for Lini 3. This is the auditor's mandate and is accepted as a heavy workload; it is carried by delegation to Lini 3 staff (Operators) and by a Lini 3 assessment window that can open as early as the start of the quarter (§2.5).

### 1.4.2 Pejabat and Operator

Every position, on every line, can be worked by two kinds of user.

| | **Pejabat** (Official) | **Operator** (Delegate) |
|---|---|---|
| Who | The officeholder named in a decree | A staff member the Pejabat chooses to help |
| Basis | Appointment decree, recorded on the holding | Delegation letter (number, date, uploaded file) issued by the Pejabat |
| Set up by | Superadmin | The Pejabat, self-service (FR-ADM-010) |
| Required? | Yes | **No.** Delegation is optional |
| Account | Own SSO account | Own SSO account — accounts are never shared |
| Draft register entries, comment, attach, draft assessments and explanations | Yes | Yes |
| **Finalising actions:** publish the register, finalise an assessment, send an explanation | Yes (Pokja: the Pengisi only) | **No** — may mark a draft "Siap" for the Pejabat |
| Appoint or revoke Operators | Yes (Pokja: the Pengisi only) | No |
| Ends when | Superadmin closes the holding ("Alih Pejabat") | The Pejabat revokes it, its end date passes, or the appointing Pejabat's holding ends |

Rules:

- One person may be Operator for several positions, and Pejabat of another. The sidebar carries a position switcher card (FR-AUT-009).
- A person cannot be both Pejabat and Operator of the same position.
- When a Pejabat changes, every Operator they appointed ends automatically.
- Pokja members other than the Pengisi may read and **comment**, but not draft, finalise, or delegate. This is enforced as a holding rule on every drafting permission (INV-24), not only by role.
- An Operator can later become Pejabat of the same position; the delegation ends at that moment (FR-ADM-005).
- The audit trail always records the real actor and the position acted for.

### 1.4.3 Default Roles

Roles are **dynamic**: a Superadmin can create roles and tick their permissions. The five roles below ship as defaults and can be edited, except Superadmin.

| Role | Code | Description | How a user gets it |
|---|---|---|---|
| **Superadmin** | SAD | Configuration and oversight. Locked. Holds every permission, but object rules still apply: a Superadmin who holds no position cannot draft, comment, or finalise anywhere (decision of 11 October 2026) | Manual |
| **Pemilik Risiko** (Risk Owner) | PMR | Lini 1 | Automatic while holding a Lini 1 position |
| **Pemantau** (Coordinator) | PMT | Lini 2 | Automatic while holding a Lini 2 position |
| **Penjamin Mutu** (Quality Assurer) | PJM | Lini 3 | Automatic while holding a Lini 3 position |
| **Pengelola Master Data** (Reference Data Manager) | PMD | Manages position types, positions, stages, templates, Data Umum forms, score bands. No register access | Manual |

> **Role rules:**
> - A user may hold **more than one role**. Effective permissions are the union of all roles held.
> - Each position type names a **default role**. Holding a position — as Pejabat or Operator — grants that role for as long as the holding lasts.
> - Permissions govern **capability**; holdings and assignments govern **the object**; being the Pejabat governs **finalising actions** (RB-ADM-006, INV-12).
> - The role view switcher (in the sidebar user menu) changes which menu is displayed only; it does **not** restrict access rights.
> - Role names must never be referenced in application logic.
> - A leadership (Pimpinan) role is **out of scope** for v1.0 (§1.10).

## 1.5 Data Scope and Participation

SIMARIO has no content classification levels. What is governed is the **data scope** attached to each permission, plus who may **participate** in a thread.

| Scope | Who can see | Appears in listings |
|---|---|---|
| **Sendiri** (Own) | Lini 1: the positions the user holds. Lini 2: the Lini 1 positions in their monitoring assignment | Yes — only those positions |
| **Unit** | All Lini 1 positions within the user's work unit | Yes |
| **Semua** (All) | Every Lini 1 position | Yes |

**Participation** — commenting and attaching on a thread — is narrower than visibility. On a given Lini 1 position's threads, only these may participate:

| Participant | Basis |
|---|---|
| Pejabat (including every Pokja member) and Operators of that position | Holding |
| Holders of the Lini 2 lead and support positions assigned to that position **for the quarter the comment belongs to**, including a quarter chosen in "Terkait TW [n]" (RB-PPN-004) | Monitoring assignment |
| Holders of any Lini 3 position | Line rule |

Everyone else within scope reads only. Lini 2 "Own" read scope covers every Lini 1 position assigned to them in **any quarter of the fiscal year being viewed**, so a January reader of TW IV keeps access.

**Visibility exceptions** that override scope are listed in §2.7 (blind assessment, confidential attachments).

> This section and §2.7 are the single source of truth for every visibility FR. Modules reference them rather than restating access rules.

## 1.6 Business Requirements

| Code | Business Requirement | Rationale | Prio |
|---|---|---|---|
| **BR-001** | Each Lini 1 position builds **one risk register per fiscal year**, covering the stages specific to its risk owner type and three risk types, and runs it for the whole year | PP 60/2008; Rapim deck 12 October 2026 | High |
| **BR-002** | Risk and mitigation wording is standardised through central templates, with custom additions where the template does not cover a situation | Divergent wording makes data impossible to consolidate | High |
| **BR-003** | *Deferred.* Each risk is scored on impact and likelihood. **Disabled in v1.0**; columns provisioned | Decision of 10 October 2026 | Low |
| **BR-004** | Lini 1 self-assesses **each risk every quarter** on a 0–4 score, supported by evidence | Rapim deck; quarterly cadence aligns with Lini 3 | High |
| **BR-005** | **Each** Lini 3 directorate independently assesses each risk every quarter on the same scale, without seeing other assessments first | Three lines principle; independence of quality assurance | High |
| **BR-006** | Risks rated Kurang Terkendali by Lini 3 in consecutive quarters are detected and notified | Recurring uncontrolled risk is otherwise discovered only during audit | High |
| **BR-007** | Every data change is recorded and traceable | The application handles fraud risk | High |
| **BR-008** | Role structure, permissions, position types, stages, Data Umum forms, quarter deadlines, and score bands are changeable without redeployment | Institutional structure is still settling | High |
| **BR-009** | Registers stay continuous when the officeholder changes mid fiscal year | KPA and PPK turnover is routine | High |
| **BR-010** | The Lembar Komunikasi Tiga Lini and the Lembar Mutu can be printed for signature | Requested by APIP and external auditors | Medium |
| **BR-011** | Risk owners can track their own risk across quarters and years | Otherwise the application only burdens the person filling it | Medium |
| **BR-012** | Lateness is made visible, not prevented | A locked form loses the record permanently | Medium |
| **BR-013** | **Finalising is never blocked on the content of a self-declared judgement** | Hard gates on self-declared data teach users to under-declare | High |
| **BR-014** | **Attachments are scanned, access-controlled, retained, and recoverable** | The system is the evidentiary record for audit | High |
| **BR-015** | **Officials may delegate preparation to staff using the staff's own accounts, while finalising stays with the official** | With SSO, account sharing is neither possible nor acceptable | High |
| **BR-016** | **Coordination between the three lines happens on one shared thread per risk, and that thread is the record** | Coordination today leaves no trace; the Lembar Komunikasi must be derivable, not retyped | High |
| **BR-017** | **Lini 3 may mark attachments confidential; confidential attachments are visible only to Lini 3 and Superadmin** | Audit evidence may concern individuals or ongoing examinations | High |
| **BR-018** | **When Lini 1 rates a risk higher than Lini 3, Lini 1 must explain why and state a follow-up plan** | A mismatch without explanation is noise; one in the optimistic direction is the signal this system exists to surface | High |

> New in v2.2: BR-016 to BR-018. Rewritten: BR-001, 004, 005, 006, 010. BR-003 deferred.

## 1.7 Module List

| Ch | Module | Code | Summary | Prio |
|---|---|---|---|---|
| 3 | Authentication | AUT | SSO sign-in, local fallback, session, position switcher | High |
| 4 | Home | BRD | Line-specific work overview | High |
| 5 | Risk Register | REG | Annual register: Data Umum, stage sections, publish, copy from previous year | High |
| 6 | Risk Board | PPN | Thread per risk with mitigation sub-threads, comments, attachments, mentions | High |
| 7 | Quarterly Assessment | NIL | Lini 1 and Lini 3 assessment, blind comparison, explanation | High |
| 8 | Risk History | RWY | Risk × quarter matrix across years, Lembar Mutu summary | High |
| 9 | Communication Sheets & Print | LBR | Lembar Komunikasi and Lembar Mutu, print | Medium |
| 10 | Master Data | MST | Position types, positions, stages, templates, proposals, Data Umum forms, score bands | High |
| 11 | Notifications | NTF | In-app notifications and thread subscriptions | Medium |
| 12 | Administration | ADM | Users, holdings, delegation, roles, monitoring assignments, fiscal years, metrics, audit trail | High |

> **Removed in v2.2:** Self Assessment (SAS) and Review (REV) as separate modules. Their surviving parts live in NIL and PPN.

## 1.8 Page & Route Map

All Lini 1 work happens in a **position workspace** at `/jabatan/:jid/…`. Lini 2 and Lini 3 open the same workspace for the positions they cover; what they can do there follows their permissions (§1.5). Position, fiscal year, and quarter are always in the URL so notification and mention links open the exact context.

| Route | Page | Access | Module |
|---|---|---|---|
| `/login` | Sign in | Unauthenticated | AUT |
| `/ganti-kata-sandi` | Change password (local accounts only) | Any authenticated user | AUT |
| `/` | Home | Any authenticated user | BRD |
| `/notifikasi` | All notifications | Any authenticated user | NTF |
| `/jabatan-saya` | My positions and Operators | Any user holding a position | ADM |
| `/jabatan` | Position directory | Permission: view register, scope Unit/All | BRD |
| `/pantauan` | Positions I coordinate (Lini 2) | Holding a Lini 2 position | BRD |
| `/penilaian` | Lini 3 assessment queue | Permission: assess as Lini 3 | NIL |
| `/jabatan/:jid` | → redirects to the board of the current fiscal year | Scope over `:jid` | PPN |
| `/jabatan/:jid/papan/:ta` | Risk Board | Scope over `:jid` | PPN |
| `/jabatan/:jid/papan/:ta/risiko/:rid` | Risk thread | Scope over `:jid` | PPN |
| `/jabatan/:jid/register/:ta` | Annual register | Scope over `:jid`; editing per FR-REG | REG |
| `/jabatan/:jid/penilaian/:ta/:tw` | Quarterly assessment | Scope over `:jid` | NIL |
| `/jabatan/:jid/riwayat` | Risk History | Scope over `:jid` | RWY |
| `/jabatan/:jid/lembar/:ta/:tw` | Lembar Komunikasi and Lembar Mutu | Scope over `:jid` | LBR |
| `/master/jabatan` | Position types and positions | Permission: manage position types / positions | MST |
| `/master/tahap` | Stages per risk owner type | Permission: manage stages | MST |
| `/master/template` | Risk and mitigation templates | Permission: manage templates | MST |
| `/master/usulan` | Risk proposal queue | Permission: decide proposals | MST |
| `/master/data-umum` | Data Umum forms | Permission: manage Data Umum forms | MST |
| `/master/skala-penilaian` | Score bands 0–4 → predicate | Permission: manage score bands | MST |
| `/pengaturan/pengguna` | Users and Pejabat holdings | Permission: manage users and holdings | ADM |
| `/pengaturan/peran` | Roles and permissions | Permission: manage roles and access | ADM |
| `/pengaturan/penugasan-pemantauan` | Monitoring assignments (Lini 2) | Permission: manage monitoring assignments | ADM |
| `/pengaturan/tahun-anggaran` | Fiscal years, quarters, windows, deadlines, archiving | Permission: manage fiscal years | ADM |
| `/pengaturan/impor` | Bulk import (CSV): positions, Pejabat holdings, monitoring assignments | Permission per import kind (FR-ADM-013) | ADM |
| `/metrik` | Product metrics | Permission: manage roles and access | ADM |
| `/jejak-audit` | Audit trail | Permission: view audit trail | ADM |

> **Removed in v2.2:** `/register/:periode/:tahap`, `/penilaian/:periode`, `/riwayat`, `/reviu`, `/reviu/:registerId`, `/master/kriteria-skala`, `/master/pemilik-risiko`, `/pengaturan/periode`.

### 1.8.1 Navigation

**Sidebar** (Samudra navy, per the design system): logo block "SIMARIO · OIKN" · **position switcher card** "JABATAN AKTIF" (FR-AUT-009) · menu · user block at the bottom (avatar, name, email; its ⋯ menu holds the role view switcher, "Jabatan Saya", "Ganti Kata Sandi" for local accounts, "Keluar"). On desktop a round toggle on the sidebar edge ("Ciutkan menu" / "Luaskan menu") collapses it to an icon rail: menu names become tooltips and stay available to screen readers, section titles become dividers, the switcher card and user block shrink to their icon and avatar. The choice is remembered per user. Below 900 px the sidebar is a drawer and does not collapse.

**Topbar** (sticky, cream): breadcrumb · global search ("Ctrl K") · notification bell · contextual outline button.

**Sidebar** — items shown follow the role view selected:

| Pemilik Risiko | Pemantau | Penjamin Mutu | Pengelola Master Data | Superadmin |
|---|---|---|---|---|
| Beranda | Beranda | Beranda | Beranda | Beranda |
| Papan Risiko | Jabatan Dipantau | Antrean Penilaian | Master Data: Jabatan · Tahap · Template · Usulan · Data Umum · Skala Penilaian | Master Data (all) |
| Register | | Daftar Jabatan | | Pengaturan: Pengguna · Peran · Penugasan Pemantauan · Tahun Anggaran · Impor Data |
| Penilaian Triwulan | | Jejak Audit | | Daftar Jabatan |
| Riwayat Risiko | | | | Metrik |
| Lembar Komunikasi | | | | Jejak Audit |

For Pemilik Risiko the sidebar items are shortcuts into the workspace of the position selected in the switcher.

**Position workspace header**: position name and work unit · fiscal year selector · tabs **Papan · Register · Penilaian · Riwayat · Lembar**. The same tabs appear for every line; Lini 2 and Lini 3 reach a workspace from "Jabatan Dipantau", "Antrean Penilaian", or "Daftar Jabatan".

| Tab | Lini 1 | Lini 2 | Lini 3 |
|---|---|---|---|
| Papan | Comment, "Langkah" | Comment | Comment, confidential attachments |
| Register | Draft; Pejabat publishes | Read | Read |
| Penilaian | Lini 1 assessment, explanation | Read after comparison opens | Lini 3 assessment (blind) |
| Riwayat | Read | Read | Read |
| Lembar | Read, print | Read, print | Read, print |

## 1.9 Glossary

| Term | Definition |
|---|---|
| **SPIP** | Sistem Pengendalian Intern Pemerintah, governed by PP 60/2008 |
| **Three lines** | Lini 1 risk owner, Lini 2 coordination, Lini 3 quality assurance |
| **KPA / Kasatker** | Budget User Proxy or Head of Work Unit |
| **PPK** | Commitment Making Officer |
| **Pokja Pemilihan** | Procurement Selection Working Group. A position held by several Pejabat, one of whom is the Pengisi |
| **Pejabat Pengadaan** | Procurement Officer |
| **Position type** (*Jenis Jabatan*) | Class of position on one of the three lines. Determines identity fields and default role; for Lini 1 also stages, templates, and the Data Umum form |
| **Risk owner type** | A Lini 1 position type |
| **Position** (*Jabatan*) | A seat on one of the three lines. Persists when its holders change |
| **Pejabat** | The officeholder appointed to a position by decree. The only user who may finalise for that position |
| **Pengisi** | For a Pokja Pemilihan position, the one member who drafts, finalises, and delegates |
| **Operator** | A staff member optionally delegated by a Pejabat, using their own account |
| **Fiscal year** (*TA*) | The register's lifetime |
| **Quarter** (*Triwulan*, TW I–IV) | The assessment cycle; has an assessment window and a deadline for Lini 1 and for Lini 3 |
| **Assessment window** | The dates between which an assessor may enter scores for a quarter: from `*_opens_on` until the comparison for that risk opens |
| **Register** | One Lini 1 position's set of risks for one fiscal year: Data Umum plus stage sections |
| **Data Umum** | Register header: tujuan, kegiatan, besar anggaran, target, plus the position's identity fields |
| **Stage** (*Tahap*) | A section of the register, specific to the risk owner type (e.g. Persiapan Pemilihan for Pokja) |
| **Risk type** | Kinerja Anggaran, Ketidakpatuhan, Kecurangan |
| **Risk** | One item in the register; on the board it is a **thread** |
| **Mitigation** | A planned action under a risk; on the board it is a **sub-thread**. Mitigations are not assessed |
| **Langkah** | A Lini 1 comment marked as an action taken; feeds Section A of the Lembar Komunikasi |
| **Score** (*Skor*) | A number 0.0–4.0 given to a risk in a quarter, chosen through a *score option* (statement). Stored, never shown to users outside `/master/skala-penilaian` |
| **Score option** (*Pilihan penilaian*) | A statement that stands for one score value within a score band version; assessors choose statements, not numbers |
| **Predicate** (*Predikat*) | Kurang Terkendali / Cukup Terkendali / Terkendali dengan Baik, derived from the score by the active score bands |
| **Blind assessment** | No assessor sees another assessor's score for the same risk and quarter until the comparison opens |
| **Comparison** (*Perbandingan*) | Lini 1 predicate vs. each Lini 3 predicate: **Sesuai** or **Tidak Sesuai** |
| **Explanation** (*Penjelasan*) | Lini 1's reason/obstacle and follow-up plan for one Tidak Sesuai comparison result (i.e. per Lini 3 directorate) |
| **Print snapshot** | An immutable, numbered copy of a Lembar Komunikasi or Lembar Mutu as printed or as frozen automatically |
| **Recurring** (*Berulang*) | A risk rated Kurang Terkendali by Lini 3 in two consecutive quarters |
| **Lembar Komunikasi Tiga Lini** | Quarterly sheet per Lini 1 position: Section A (Lini 1), B (Lini 2), C (Lini 3). Derived |
| **Lembar Mutu** | Quarterly summary of the predicate per risk type, per assessor (derived from the average score, which is not shown). Derived |
| **Monitoring assignment** | Links a Lini 1 position to one Lini 2 lead position and its support positions for a quarter range |
| **Confidential attachment** | A Lini 3 attachment visible only to Lini 3 and Superadmin |

## 1.10 Out of Scope

Not built in this version:

- **Impact × likelihood scoring and risk level mapping.** Disabled; columns provisioned so later adoption needs no migration.
- **Residual risk assessment.**
- **Mitigation implementation status and mitigation-level assessment.** Mitigations are discussion sub-threads only.
- **Assessment by Lini 2.** Lini 2 coordinates through comments.
- **A formal response step by Lini 3 to Lini 1 explanations.** Lini 3 responds on the thread.
- **Leadership (Pimpinan) role and leadership dashboard.** v1.1.
- **Programmatic PDF export with a bespoke layout.** Browser print only; programmatic export follows Kepka 47 in v1.1.
- **National holiday calendar** for working-day deadlines. v1.0 counts Monday–Friday.
- **Integration with SAKTI, SIRUP, or budget planning systems.**
- **Strategic risk management.**
- **Native mobile app.**
- **Email and instant-messaging notifications.** In-app only.
- **Spreadsheet import of a register.**
- **Real-time presence and live co-editing** on threads. New comments appear on refresh or within 30 seconds by polling.

## 1.11 Open Items

| # | Item | Owner | Blocks | Impact if unanswered |
|---|---|---|---|---|
| OQ-3 | Which unit holds the Reference Data Manager role | Process owner | Release | Reference data has no owner and will drift |
| OQ-5 | Official output format under Kepka 47 | Process owner | v1.1 | Printouts are not official documents |
| OQ-8 | Attachment retention period and archival rule (ANRI) | Process owner + Legal | v1.0 config | No defensible disposal rule |
| OQ-12 | Revise the Rapim deck's Lembar Komunikasi cadence from monthly to quarterly | Process owner | Release | Users are told one cadence by the deck and see another in the application |

> **Closed in v2.6** (process-owner walkthrough, 11 October 2026): OQ-1 — scoring guidance is the deck's "Panduan Skoring dan Self-Assessment untuk Model Tiga Lini", entered as the per-predicate guidance text (FR-MST-007); OQ-2 — windows and deadlines are configurable per quarter, using the §2.5 defaults; OQ-4 — Product Owner Binsar H. Simanjuntak; OQ-6 — stages, templates, and Data Umum from the Rapim deck are final seed data; OQ-11 — staff lookup by NIP or name is available from the OIKN Keycloak realm.
>
> Closed in v2.2: OQ-7 (cadence — quarterly), OQ-9 (Pokja members comment), OQ-10 (both Lini 3 directorates assess).

## 1.12 Changes

Substantive changes only.

### Changes in v2.5 — re-review

| # | Change | Where |
|---|---|---|
| T-01 | **Viewer-dependent blindness for late directorates.** A Lini 3 position whose own result for a risk has not opened sees nothing about that risk's other assessments — scores, notes, explanations, Sesuai/Tidak Sesuai, Berulang — in any page, derived view, snapshot, notification, or audit value. | VIS-9, INV-16, FR-NIL-007, 008, 011, FR-NTF-007, 008, 010, FR-BRD-007, FR-NIL-010, FR-LBR-010 |
| T-02 | **Holding rule reworded**: content actions need a holding on the **acting** position; downloading is not a content action. Lini 2 and Lini 3 act on Lini 1 positions through participation and the line rule. | FR-ADM-002, INV-25 |
| T-03 | **Archiving** projected and run only at the extended hard limit; results opening during the extension carry no explanation obligation. | §2.5, FR-ADM-007, §2.8 |
| T-04 | **Exclusion** from the expected Lini 3 set only while the position has finalised nothing in the quarter; opening re-evaluated on exclusion. Uses permission 19. | §2.5 |
| T-05 | **Comment attribution**: while an earlier quarter of the same fiscal year still has an open comparison or explanation for the risk, the composer offers "Terkait TW [n]"; participation and sheet placement follow the chosen quarter. | RB-PPN-004, FR-PPN-003, §1.5 |
| T-06 | Predicates use the quarter's band version everywhere. | FR-NIL-002, RB-NIL-002 |
| T-07 | Per-quarter filters (quiet marker, counts, Objective 2) follow RB-REG-006, not `status`; TW IV deactivation badge defined. | FR-PPN-009, FR-BRD-005, §1.3, FR-ADM-011, FR-REG-010 |
| T-08 | Operator promotion also in "Tetapkan Jabatan" and CSV; Pengisi validated against existing holdings. | FR-ADM-004, 013 |
| T-10 | Snapshot totals recomputed for a still-blind viewer; Langkah cannot be attributed to an earlier quarter. | FR-LBR-010, FR-PPN-003 |
| T-09 | Permission 10 can only be ticked on roles that are the default role of a Lini 3 type, and on Superadmin; confidential switch-off uses permission 25. | FR-ADM-002, VIS-3, FR-PPN-006, §2.8 |

### Changes in v2.4 — independent review

Source: independent review of v2.3 and decisions of 11 October 2026.

| # | Change | Where |
|---|---|---|
| S-01 | **Blindness applies to every derived view.** Sheets, Lembar Mutu, Home result cards, Risk History, and print snapshots show a score only once that assessor's result for that risk has opened; snapshots are built from a viewer-neutral view. | §2.7 VIS-7, ch. 8, 9 |
| S-02 | **Audit trail redacts** blind scores, predicates, notes, and confidential filenames until the result opens. | §2.7 VIS-8, FR-ADM-008 |
| S-03 | **A late directorate stays blind** after a partial opening until its own result opens; Lini 3 sees Lini 1 comment attachments, never Lini 1 assessment attachments. | VIS-1, VIS-2, VIS-5, FR-NIL-005 |
| S-04 | Comment quarter is taken within the thread's own fiscal year, capped at TW IV. | §2.8 Comment, RB-PPN-004 |
| S-05 | **Three Superadmin permissions** added: blind view, remove confidential mark, manual archive (26 codes). Superadmin cannot draft, comment, or finalise without a holding. | FR-ADM-002, 003, App. A |
| S-06 | Non-Pengisi Pokja members cannot draft (holding rule). Losing or moving the Pengisi is handled. | INV-4, INV-11, INV-24, FR-ADM-004, 005 |
| S-07 | Operator → Pejabat of the same position supported. | FR-ADM-005, RB-AUT-004 |
| S-08 | **Alih Pejabat effective date** ≤ today, applied immediately; earlier actions of the outgoing Pejabat stay valid. | FR-ADM-005 |
| S-09 | Monitoring assignment resolved from the quarter of the object, not the calendar. | §1.5, FR-NTF-007, 010, FR-BRD-005 |
| S-10 | **Expected Lini 3 set per quarter**; Superadmin may exclude a vacant directorate with a reason; `partial` → `open` defined; TW IV completeness defined against the set. | §2.5, `QuarterAssessor` |
| S-11 | Recurring detection re-evaluates the following quarter on late openings. | FR-NIL-011 |
| S-12 | `ready` status for mid-year additions; deactivation sets `inactive` immediately, assessment filtered by `deactivated_from_quarter_id`. | §2.8, FR-REG-008, 010 |
| S-13 | **Lini 3 note optional at every score**, no gate. | FR-NIL-005 |
| S-14 | Bulk import columns specified. | FR-ADM-013 |
| S-15 | Archiving: automatic only at the hard limit (extended to cover open explanation deadlines); manual archive once TW IV is complete; `closing` defined. | §2.5, FR-ADM-007 |
| S-16 | Score band version fixed per quarter. | §2.8 Quarter, FR-MST-007 |
| S-17 | Minor: snapshot numbers unique across work units; storage for photo selection, last visits, filters, time-on-task; declarations after publish; inactive stages on copy; mandatory Data Umum fields; Risk History cell states for variable Lini 3; confidential filenames never listed; traceability completed. | various |

### Changes in v2.3 — end-to-end review

Source: walk-through of v2.2 and decisions of 11 October 2026.

| # | Change | Where |
|---|---|---|
| R-01 | **Finalising is per risk.** "Tuntaskan" locks only the risks already scored; the rest stay fillable and can be finalised later until their comparison opens. Reopen is per risk. Risks added after a partial finalise are simply assessed and finalised in turn. | §2.5, §2.6, FR-NIL-003, 004, 006 |
| R-02 | **Explanations are stored per comparison result** (per Lini 3 directorate), so a late directorate's mismatch creates its own explanation. One text may be reused for several results. | §2.8, FR-NIL-008, 009 |
| R-03 | **Hard archive limit**: TW IV Lini 3 deadline + tolerance + grace days (default 30, configurable). Missing assessments become "Tidak dinilai", missing mandatory explanations "Tidak dikirim". | §2.5, FR-ADM-007 |
| R-04 | **Assessment windows** per quarter, configurable: Lini 1 opens by default on the first day of the quarter's third month; Lini 3 by default on the first day of the quarter. Outside the window the page is read-only. | §2.5, FR-NIL-001, FR-ADM-007 |
| R-05 | **Numbered print snapshots** and automatic freezing of the quarter's sheets, with a new version when late Lini 3 results or late explanations arrive. | ch. 9, §2.8 |
| R-06 | **Home follows open obligations from any fiscal year**, not the calendar — so TW IV of last year stays on Home in January. | FR-BRD-001, 006 |
| R-07 | **Lini 3 window extendable through configuration**; Lini 3 workload carried by delegation. | §1.4.1, R-04 |
| R-08 | **Bulk CSV import** for positions, Pejabat holdings, and monitoring assignments, with dry-run validation. | FR-ADM-013 |
| R-09 | **Blind-phase guidance** in the Lini 3 composer. | FR-PPN-003 |
| R-10 | Recurring counts across directorates; unpublished registers listed in the Lini 3 queue; Lini 2 lead/support distinction kept. | FR-NIL-010, 011 |

### Changes in v2.2 — flow

Source: design decisions of 10 October 2026.

| # | Change | Where |
|---|---|---|
| F-01 | **Register is annual** per Lini 1 position, with stages as sections. Replaces the monthly register per stage. Carryover and lineage between periods are removed. | §2.8, ch. 5 |
| F-02 | **Stages are specific to the risk owner type**, seeded from the deck. The sixth default stage "Pengadaan Barang/Jasa" and the active-month calendar are removed. | ch. 10 |
| F-03 | **Publish once, add any time.** Operators prepare and mark "Siap", the Pejabat publishes. Published wording is immutable; replacing a risk means deactivating it with a reason and adding a new one. | ch. 5 |
| F-04 | **Copy from previous year** keeps a link, so history runs across years. | FR-REG-009 |
| F-05 | **Risk Board.** Every risk is a thread with mitigation sub-threads; comments carry the author's line, "Langkah", mentions, attachments, and a confidential mark for Lini 3. Replaces the review screen. | ch. 6 |
| F-06 | **Quarterly, per-risk assessment** on a 0–4 score with automatic predicate. Replaces monthly per-mitigation control status. Mitigation implementation status removed. | ch. 7 |
| F-07 | **Lini 3 assesses independently**, both directorates, blind; comparison by predicate opens when all are done or at the Lini 3 deadline. | ch. 7, §2.5 |
| F-08 | **Tidak Sesuai → explanation**, mandatory when Lini 1 rated higher; reason/obstacle plus follow-up plan; 5 working days. | FR-NIL-008 |
| F-09 | **Approve/return, submission flags on review, and review cycles removed.** | — |
| F-10 | **Recurring** redefined on Lini 3 Kurang Terkendali in consecutive quarters. | FR-NIL-011 |
| F-11 | **Confidential attachments** for Lini 3. | §2.7, FR-PPN-006 |
| F-12 | **Lembar Komunikasi and Lembar Mutu are derived** from threads and assessments; print replaces the register printout. | ch. 9 |
| F-13 | **Impact × likelihood scoring disabled**; template default scores removed from the UI. | §1.10 |
| F-14 | **Position workspace and route map** rebuilt around `/jabatan/:jid/…`. | §1.8 |
| F-15 | Permission catalogue rebuilt for the new flow (23 codes; 26 from v2.4). | FR-ADM-002 |
| F-16 | Fiscal-year archiving after the TW IV cycle completes, not on 31 December. | §2.5 |

### Changes in v2.1 — accounts and roles

| # | Change |
|---|---|
| D-01 | Generic "Pereviu" retired; Pemantau (Lini 2) and Penjamin Mutu (Lini 3) roles |
| D-02 | Positions on all three lines; `PositionType` replaces `RiskOwnerType` |
| D-03 | Pejabat Pengadaan added; Pokja PBJ renamed Pokja Pemilihan |
| D-04 | Pokja held by several Pejabat, one Pengisi |
| D-05 | Optional delegation to Operators; only the Pejabat finalises |
| D-06 | Roles follow holdings |
| D-07 | Lini 2 assigned as a team by position; Lini 3 unassigned |
| D-08 | Status flow settings removed |
| D-09 | Accounts can be created by delegation |
| D-10 | "Alih Pejabat" replaces register ownership transfer |
| D-11 | Position switcher |
| D-12 | Pimpinan role out of scope |

### Changes in v2.0 (from v1.0)

Validation philosophy reversed from hard gates to flags; data model added; single deadline source; configurable cadence; SSO in v1.0; attachment security, retention, and backup requirements; time-on-task objective and metrics page.

---

# 2. ARCHITECTURE & GENERAL PROVISIONS

## 2.1 Stack & Environment

Taken from the OIKN house stack used by LANTARA and Aksara, so the application is operable by the same team without new runtime knowledge.

| Aspect | Provision |
|---|---|
| Backend | Django 5 + Django REST Framework |
| Async / scheduled work | Celery + Redis; Celery Beat for deadline reminders, comparison opening, recurrence detection, archiving |
| Database | PostgreSQL 16 |
| Frontend | React 18 + Vite + TypeScript |
| Object storage | MinIO, separate from the database, for attachments and decree/letter files |
| Authentication | Keycloak (OIDC) against the "Otorita IKN" realm at sso.ikn.go.id, from v1.0. NIP is the stable identifier. Local password accounts are a fallback |
| Deployment | Docker Compose behind nginx; separate staging and production |
| Hosting | OIKN internal environment |

## 2.2 Global Design Provisions

> **Design system.** Colours, typography, radius, shadows, interaction patterns, and components are specified in **`DesignSystem_SIMARIO.md` (v1.0)**, built on the production tokens of Aksara (KMS OIKN) so DKB applications share one visual family. Where this section and the design system differ on visual detail, the design system wins; layout rules below remain authoritative.

| Aspect | Provision |
|---|---|
| Primary device | Laptop; responsive down to phone |
| Content max-width | 1200 px; **1368 px when the sidebar is collapsed** (the 168 px the rail frees goes to the content). Pages use the full content width; no page narrows itself further, except print-like documents (Lembar, A4) and the sign-in and error pages |
| Breakpoint | **Single, at 900 px.** Above: multi-column with fixed sidebar. Below: single column, sidebar becomes a drawer |
| Tables on narrow screens | Become stacked cards. **No** horizontal scrolling |
| Sidebar | 240 px, fixed on desktop, collapsible to a 72 px icon rail; Samudra navy with a soft gradient and a faint grain texture; holds the position switcher card (Aksara "Portal Aktif" pattern) |
| Topbar | Sticky; breadcrumb, global search, notification bell, contextual button |
| Predicate colours | Kurang Terkendali (danger), Cukup Terkendali (accent/amber), Terkendali dengan Baik (success), exact tokens in the design system §2.4. Every badge carries text; colour is never the only signal |
| Line labels on comments | Lini 1, Lini 2, Lini 3 as text chips, design system §2.4 |
| Content padding | 32 px desktop, 16 px phone |
| Palette and type | Nusantara palette with full hex values (Khatulistiwa `#185088`, Terakota `#DBAF6C`, Jagawana `#428A40`, Pertiwi `#FBF9D5`, Buana `#04182A`, Samudra `#0A2342`, Langit `#3A7BC8`, Tirta `#E3ECF6`, Saka `#EE2F24`); fonts Newsreader (display), Plus Jakarta Sans (UI), JetBrains Mono (numbers, eyebrows). Light mode in v1.0; dark tokens prepared. See the design system |
| UI language | Formal Bahasa Indonesia |

## 2.3 Non-Functional Requirements

| Code | Aspect | Provision |
|---|---|---|
| NFR-001 | Performance | Home, board, and list pages render within 2 s on a 10 Mbps connection. A thread with 200 comments renders within 2 s; older comments load in pages of 50 |
| NFR-002 | Security | HTTPS required; input sanitised against XSS (comment bodies are plain text with line breaks and mentions only — no HTML, no Markdown rendering in v1.0); CSRF protection; hashed local passwords; sign-in throttling |
| NFR-003 | Availability | ≥99.5% uptime outside maintenance windows |
| NFR-004 | Accessibility | WCAG 2.1 Level AA; minimum contrast 4.5:1; all controls keyboard operable |
| NFR-005 | Compatibility | Chrome 115+, Edge 115+, Firefox 120+ |
| NFR-006 | Scalability | Concurrency target = number of active Lini 1 positions × 1.5, measured in the last three days before a Lini 1 quarter deadline. Until positions are seeded, plan for 120 concurrent |
| NFR-007 | Audit trail | Every data change recorded with timestamp, actor, acting capacity, acting position, and before/after values. Append-only. Before/after values are redacted per VIS-8 |
| NFR-008 | Session | Ends after 60 minutes of inactivity. Drafts autosave before termination |
| NFR-009 | Attachment formats | PDF, DOCX, XLSX, PNG, JPG, MP4. Maximum 20 MB per file; **10 files per comment or assessment**. MIME type verified server-side against content |
| NFR-010 | Attachment scanning | Every file is scanned by ClamAV before becoming downloadable. Until then it shows "Memindai…". A failed scan quarantines the file, notifies the uploader, and records an audit entry |
| NFR-011 | Attachment access | Served through pre-signed URLs valid for 5 minutes, generated only after a permission check that includes scope **and** the confidentiality rule (§2.7). Buckets are never publicly readable |
| NFR-012 | Storage quota | 1 GB per Lini 1 position per fiscal year, counting all attachments on its threads and assessments, configurable. At 90% participants are warned; at 100% upload is refused with a message naming the quota |
| NFR-013 | Retention | Registers, threads, assessments, attachments, and audit entries are retained for the period set by OQ-8, minimum 5 fiscal years. Disposal is a documented administrative action, never automated |
| NFR-014 | Backup & recovery | Nightly full database backup with 30-day retention; object storage replicated. RPO 24 hours, RTO 8 hours. Restore drill before go-live |
| NFR-015 | Thread freshness | A thread page polls for new comments every 30 seconds while visible and shows "[n] komentar baru" rather than inserting them under the reader's cursor |

## 2.4 Standard Interaction Patterns

- **Empty state:** icon, heading, one explanatory sentence, and a primary action where one exists.
- **Loading state:** a skeleton resembling the final layout.
- **Error state:** red alert box above the content with an explanation and "Coba Lagi".
- **Destructive confirmation:** dialog with a red primary button.
- **Success:** toast, top right, 4 seconds.
- **Autosave:** register drafts, assessment drafts, explanation drafts, and unsent comment text save automatically; "Draf tersimpan" in the bottom bar.
- **Action buttons are never disabled without explanation.** Where something is incomplete the button stays active and pressing it lists the gaps. The one exception is finalising actions for Operators: the button is shown disabled with the line "Dilakukan oleh [Nama Pejabat]" beneath it.
- **Deactivate, never delete.** Reference data, users, risks, and mitigations are deactivated so history stays intact.
- **Pagination:** 25 rows per page on list tables; 50 comments per page on threads.

## 2.5 Time, Quarters, and Lateness

**Calendar entities.** A `FiscalYear` holds four `Quarter` rows. Every date below is configurable per quarter in Settings (FR-ADM-007); the defaults are generated when a fiscal year is created and are pending OQ-2.

| Field | Meaning | Default |
|---|---|---|
| `starts_on`, `ends_on` | Quarter boundaries | Calendar quarters |
| `lini1_opens_on` | From this date Lini 1 may enter scores for the quarter | First day of the quarter's third month |
| `lini1_deadline` | Lini 1 should finalise by this date | Last Friday of the quarter's third month |
| `lini3_opens_on` | From this date Lini 3 may enter scores for the quarter | First day of the quarter |
| `lini3_deadline` | Lini 3 should finalise by this date | First Friday of the following month |
| `explanation_workdays` | Working days after a comparison result opens for Lini 1 to send its explanation | 5 |

Fiscal-year fields: `tolerance_days` (default 7) separates the two lateness levels; `archive_grace_days` (default 30) sets the hard archive limit.

**Assessment window.** An assessor may enter, mark ready, finalise, and reopen scores for a risk from their `*_opens_on` date **until the comparison for that risk opens** (for Lini 3: until that directorate's comparison opens). Before the window opens the assessment page is read-only with "Penilaian TW [n] dibuka mulai [tanggal]". The window has no closing date of its own — lateness is marked, not locked.

**Lateness** — for any finalising action with a deadline:

| Condition at the moment of finalising | Marker |
|---|---|
| ≤ deadline | None |
| deadline < t ≤ deadline + tolerance | **Terlambat** |
| t > deadline + tolerance | **Sangat Terlambat** |

The marker is fixed per risk at the moment that risk is finalised and never recomputed. **Nothing is locked by a deadline** (BR-012), except the comparison freeze below and the hard archive limit, both of which protect the record rather than punish lateness.

**Finalising is per risk.** "Tuntaskan Penilaian" finalises the risks that currently have a score (or a "Belum relevan" declaration) and leaves the rest as they are. It may be pressed any number of times. A risk added to the register mid-quarter is simply scored and finalised in turn.

**Expected Lini 3 set.** When a quarter's `lini3_opens_on` arrives, the Lini 3 positions active at that moment are recorded as the quarter's expected assessors (`QuarterAssessor`). A user with permission 19 (Superadmin by default) may exclude a position from a quarter's set — for example a directorate left vacant — with a mandatory reason, audit-logged, **only while that position has no finalised assessment in the quarter**; its drafts are discarded, it takes no part in that quarter's comparisons, and every affected risk's opening is re-evaluated immediately. Exclusion cannot be undone once another result for the quarter has opened. Positions created later join from the next quarter.

**When a comparison opens.** Evaluated per risk by a scheduled task and on every finalise event. "Every Lini 3 position" below means the quarter's expected set:

| Condition | Result |
|---|---|
| Lini 1 and every Lini 3 position have finalised this risk | Comparison **opens** (`open`) |
| `lini3_deadline` has passed, and at least one Lini 3 position has finalised this risk | Comparison **opens partially** (`partial`) for the Lini 3 positions that finalised; each remaining Lini 3 position's result opens the moment it finalises |
| `lini3_deadline` has passed and no Lini 3 position has finalised this risk | Stays `waiting`; Lini 3 marked Terlambat |

A `partial` comparison becomes `open` when every expected Lini 3 position's result for that risk has opened or has been closed as "Tidak dinilai [Direktorat]" at archive.

When a risk's comparison first opens (fully or partially), its Lini 1 assessment, if not finalised, is closed as **"Tidak dinilai Lini 1"**. Every assessment that is part of an opened result becomes immutable (INV-18).

**Explanation deadline.** Per comparison result: that result's `opened_at` + `explanation_workdays`, counting Monday–Friday (§1.10).

**Fiscal-year status.** `open` until the day after TW IV `ends_on`; then `closing` until archived.

**Fiscal-year archiving.**

1. **TW IV complete** — every TW IV risk's comparison is `open` against its expected set, and every mandatory explanation has been sent or has passed its deadline + tolerance. From then a Superadmin **may archive manually** (permission 26).
2. **Hard limit** — archiving runs **automatically** at the later of: TW IV `lini3_deadline` + `tolerance_days` + `archive_grace_days`; and the latest deadline + tolerance of any explanation already pending at that date. A result that opens after the base hard limit (during this extension) gets `explanation_status = not_required`; no new obligations are created.

At archiving, any assessment not finalised becomes `not_assessed` ("Tidak dinilai Lini 1" or "Tidak dinilai [Direktorat]"), any mandatory explanation not sent becomes `not_sent` ("Tidak dikirim"), and a final automatic snapshot of every quarter's sheets is taken (FR-LBR-009). Everything in the fiscal year then becomes read-only (INV-21). A new fiscal year's register can be drafted and published from 1 January, in parallel with the closing TW IV cycle. Lini 1 is notified 14 days before the projected archive date.

## 2.6 Validation Philosophy

> **The most important behavioural rule in the document (BR-013).** Every hard gate placed on a **self-declared judgement** creates an incentive to declare something else. If the system refuses to finalise until a weak score is justified, the cheapest path is a higher score.

| Situation | Behaviour |
|---|---|
| A stage's risk type section has no risks and no "tidak ada risiko" declaration, at publish | **Blocks publish.** Structural; the honest escape hatch is one click away |
| A mandatory Data Umum field is empty, at publish | **Blocks publish.** Structural, not a judgement |
| "Tidak ada risiko" or "Tahap tidak relevan" declared without a reason | **Blocks.** The reason field is the escape hatch |
| A risk has no mitigation, at publish | **Publishes, flagged** `no_mitigation` |
| A Lini 1 assessment has a score but no attachment | **Finalises, flagged** `no_evidence` (feeds Objective 3) |
| "Belum relevan triwulan ini" chosen without a reason | **Blocks finalise.** Escape hatch |
| Some risks have no Lini 1 score when the Pejabat presses "Tuntaskan" | **Finalises the scored risks only.** The others stay open for entry and become "Tidak dinilai Lini 1" only if their comparison opens first |
| Lini 1 rated higher than a Lini 3 directorate and no explanation has been sent | Nothing is blocked. The result shows "Penjelasan belum dikirim"; after the deadline, Terlambat; at archive, "Tidak dikirim" |

**Flags are first-class data**, stored on the row they concern. They are shown to the owner before finalising, on the board, on the assessment page to everyone once the comparison opens, and on the printed sheets.

## 2.7 Visibility Rules

These override data scope (§1.5). Each is enforced in the API serializer, not only in the interface, and covered by tests.

| # | Rule | Who sees | Who does not |
|---|---|---|---|
| VIS-1 | **Blind assessment.** For one risk and quarter, before **that assessor's own** result has opened | The assessor's position holders see only their own score, predicate, note, and assessment attachments | Every other assessor and every non-assessor, including Lini 2. A Lini 3 position whose own result has not opened stays blind to Lini 1 and to the other directorate **even after their results have opened**. Superadmin sees all only via FR-NIL-012, audit-logged |
| VIS-2 | **After a result opens** | Everyone within scope sees the Lini 1 assessment and that Lini 3 position's score, predicate, note, non-confidential attachments, and the result — **except** a Lini 3 position whose own result for that risk has not opened (VIS-1) | — |
| VIS-3 | **Confidential attachment** (Lini 3 only) | Users whose permissions include 10 — by construction only Lini 3 roles and Superadmin (each Superadmin access audit-logged) | Lini 1, Lini 2, PMD, anyone else. They see "[n] lampiran konfidensial" with no filename |
| VIS-4 | Lini 3 assessment attachments are confidential **by default**; Lini 3 comment attachments are open by default and can be marked confidential | — | — |
| VIS-5 | **Between Lini 3 directorates**, each directorate's assessment and its assessment attachments are hidden from the other until the other's own result for that risk has opened | — | — |
| VIS-6 | **Withdrawn comments** show "Komentar ditarik oleh [nama] pada [waktu]"; the original text is visible only in the audit trail | — | — |
| VIS-7 | **Derived views.** Lembar Komunikasi, Lembar Mutu, Home result cards, Risk History, metrics, and print snapshots include an assessor's score for a risk only once that assessor's result for that risk has opened; averages are computed only over such risks. Snapshots are built from this viewer-neutral view, never from the printing user's own view | — | Nobody sees a blind score through a derived figure |
| VIS-8 | **Audit redaction.** In audit before/after values, an assessment's score, predicate, and note are shown as "[disamarkan]" until its result opens, and a confidential attachment's filename is shown as "[konfidensial]" to anyone without permission 10 | Superadmin with permission 24 sees unredacted values, each view logged | Everyone else |
| VIS-9 | **Late directorate.** For a given risk and quarter, a Lini 3 position whose own result has not opened (and is not excluded) sees, about that risk and quarter: no other assessment, no comparison result, no explanation, no Sesuai/Tidak Sesuai or Berulang marker, and no notification that would reveal them. This applies to every page, derived view (VIS-7), snapshot, export, notification, and audit value (VIS-8), and overrides VIS-2 for that position | All others per VIS-2 | That Lini 3 position's holders |

> **Scores are not displayed (v2.8).** Users see the chosen statement and its predicate, never the numeric score or an average. Numbers appear only on `/master/skala-penilaian`, in the metrics CSV export, and in the import tool. Like VIS rules, this is applied in data selectors, not only hidden in markup.

## 2.8 Data Model

### 2.8.1 Entities

**Organisation, identity, access** — carried from v2.1, with `MonitoringAssignment` now keyed on quarters.

| Entity | Key fields | Notes |
|---|---|---|
| `OrgUnit` | `id`, `code`, `name`, `active` | Work unit |
| `PositionType` | `id`, `name`, `line` (1–3), `default_role_id`, `allows_multiple_officials`, `identity_schema` (JSONB), `has_templates`, `is_builtin`, `active` | `has_templates` true only for Lini 1 |
| `Position` | `id`, `code`, `name`, `org_unit_id`, `position_type_id`, `identity` (JSONB), `active` | `code` unique within `org_unit` |
| `User` | `id`, `nip` (unique), `email`, `full_name`, `keycloak_sub`, `is_local_account`, `must_change_password`, `created_via`, `active` | `created_via` ∈ {`admin`, `delegation`} |
| `PositionOccupancy` | `id`, `position_id`, `user_id`, `is_filler`, `start_date`, `end_date`, `decree_no`, `decree_date`, `decree_object_key` | Pejabat holding |
| `PositionDelegate` | `id`, `position_id`, `user_id`, `appointed_by_occupancy_id`, `letter_no`, `letter_date`, `letter_object_key`, `start_date`, `end_date`, `end_reason` | Operator holding. `end_reason` ∈ {`revoked`, `expired`, `official_changed`, `filler_changed`, `promoted`, `user_deactivated`} |
| `Role` | `id`, `name`, `is_locked` | |
| `Permission` | `code`, `group`, `scope_kind`, `requires_official`, `is_drafting` | 26 codes (FR-ADM-002). `is_drafting` marks actions closed to non-Pengisi members of multi-Pejabat positions (INV-24) |
| `RolePermission` | `role_id`, `permission_code`, `scope` | |
| `UserRole` | `user_id`, `role_id`, `source`, `source_ref` | `source` ∈ {`manual`, `position`} |
| `MonitoringAssignment` | `id`, `target_position_id`, `lead_position_id`, `quarter_from_id`, `quarter_to_id`, `decree_no` | Lini 1 → Lini 2 lead |
| `MonitoringSupport` | `assignment_id`, `support_position_id`, `domain` | `domain` ∈ {`budget_performance`, `procurement`} |

**Calendar**

| Entity | Key fields | Notes |
|---|---|---|
| `FiscalYear` | `year`, `status`, `tolerance_days`, `archive_grace_days`, `archived_at`, `archived_by` | `status` ∈ {`open`, `closing`, `archived`}; `archived_by` ∈ {`hard_limit`, `manual`} |
| `Quarter` | `id`, `fiscal_year`, `number` (1–4), `starts_on`, `ends_on`, `lini1_opens_on`, `lini1_deadline`, `lini3_opens_on`, `lini3_deadline`, `explanation_workdays`, `score_band_version_id` | §2.5. `score_band_version_id` is fixed when the first window of the quarter opens; band changes apply from the next quarter (FR-MST-007) |
| `QuarterAssessor` | `quarter_id`, `position_id`, `excluded`, `exclusion_reason`, `excluded_by_user_id` | Expected Lini 3 set, recorded at `lini3_opens_on` (§2.5) |

**Reference data**

| Entity | Key fields | Notes |
|---|---|---|
| `Stage` | `id`, `position_type_id`, `name`, `order`, `active` | Stages belong to a risk owner type |
| `DataUmumForm` | `id`, `position_type_id`, `version`, `schema` (JSONB), `default_objective`, `active` | Fields beyond the fixed four; versioned |
| `RiskTemplate` | `id`, `position_type_id`, `stage_id`, `risk_type`, `description`, `active`, `usage_count`, `default_impact`, `default_likelihood` | Impact/likelihood **provisioned, unused** |
| `MitigationTemplate` | `id`, `risk_template_id`, `description`, `order`, `active` | |
| `RiskProposal` | `id`, `source_register_risk_id`, `description`, `proposer_user_id`, `status`, `rejection_reason` | |
| `ScoreBandVersion` | `id`, `effective_from`, `status` | Exactly one `active` |
| `ScoreBand` | `version_id`, `lower_exclusive`, `upper_inclusive`, `predicate`, `order` | Seed: [0, 2.0] Kurang · (2.0, 3.0] Cukup · (3.0, 4.0] Terkendali dengan Baik |
| `ScoreOption` | `id`, `version_id`, `value` (numeric 2,1), `label`, `order` | One list per `ScoreBandVersion`, used for every risk. Seed: illustrative statements for 0, 1, 2, 3, 4 from `docs/seed/pilihan_penilaian.json` |
| `ScaleCriteriaVersion`, `ScaleCriteriaRow`, `RiskLevelMapping` | as v2.0 | **Provisioned, unused** |

**Register**

| Entity | Key fields | Notes |
|---|---|---|
| `Register` | `id`, `position_id`, `fiscal_year`, `status`, `data_umum` (JSONB), `data_umum_form_id`, `copied_from_register_id`, `published_at`, `published_by_user_id` | **Unique on (`position_id`, `fiscal_year`)**. `status` ∈ {`draft`, `ready`, `published`, `archived`} |
| `RegisterStageDeclaration` | `register_id`, `stage_id`, `risk_type` (nullable), `kind`, `reason` | `kind` ∈ {`stage_not_relevant`, `no_risk_in_type`}; `risk_type` null for a whole-stage declaration |
| `RegisterRisk` | `id`, `register_id`, `stage_id`, `risk_type`, `risk_template_id` (nullable), `description_snapshot`, `is_custom`, `status`, `published_at`, `deactivated_at`, `deactivated_from_quarter_id`, `deactivation_reason`, `previous_year_risk_id`, `lineage_id`, `flags`, `impact`, `likelihood`, `score` | `status` ∈ {`draft`, `ready`, `active`, `inactive`}; `inactive` is set immediately on deactivation, while assessment continues through the quarter before `deactivated_from_quarter_id`. `lineage_id` shared across years via copy. Impact/likelihood/score **provisioned, unused** |
| `RegisterMitigation` | `id`, `register_risk_id`, `mitigation_template_id` (nullable), `description_snapshot`, `is_custom`, `order`, `status`, `deactivation_reason` | Same status set, including `ready` |

**Board**

| Entity | Key fields | Notes |
|---|---|---|
| `Comment` | `id`, `register_risk_id`, `register_mitigation_id` (nullable), `author_user_id`, `author_line`, `acting_as`, `acting_position_id`, `quarter_id`, `body`, `is_step`, `created_at`, `edited_at`, `withdrawn_at`, `withdrawn_by_user_id` | `is_step` only when `author_line = 1`. `quarter_id` = the quarter **of the thread's own fiscal year** containing `created_at`; a comment posted after that fiscal year ends belongs to its TW IV; may instead be an earlier quarter chosen by the author per RB-PPN-004 |
| `Mention` | `comment_id`, `user_id` | |
| `ThreadSubscription` | `user_id`, `register_risk_id`, `muted` | Auto-created on participation |

**Assessment**

| Entity | Key fields | Notes |
|---|---|---|
| `RiskQuarter` | `id`, `register_risk_id`, `quarter_id`, `comparison_status`, `first_opened_at`, `no_step_flag`, `recurring` | One row per risk per quarter in which it is assessed (RB-REG-006), created when the risk is published or the quarter starts. `comparison_status` ∈ {`waiting`, `partial`, `open`} |
| `Assessment` | `id`, `risk_quarter_id`, `assessor_position_id`, `assessor_line`, `status`, `score` (numeric 2,1), `predicate`, `not_relevant`, `not_relevant_reason`, `note`, `score_band_version_id`, `finalised_by_user_id`, `finalised_at`, `lateness`, `flags` | **Unique on (`risk_quarter_id`, `assessor_position_id`).** `status` ∈ {`draft`, `ready`, `final`, `not_assessed`}; finalised **per row**. `note` used by Lini 3 |
| `ComparisonResult` | `id`, `risk_quarter_id`, `lini3_position_id`, `opened_at`, `result`, `lini1_higher`, `explanation_required`, `explanation_status`, `explanation_due_on`, `explanation_reason`, `explanation_plan`, `explanation_sent_at`, `explanation_sent_by_user_id`, `explanation_lateness` | One row per Lini 3 position once its result opens. `result` ∈ {`sesuai`, `tidak_sesuai`, `incomparable`}. `explanation_status` ∈ {`not_required`, `optional`, `pending`, `ready`, `sent`, `not_sent`} |

**Files, notification, audit**

| Entity | Key fields | Notes |
|---|---|---|
| `Attachment` | `id`, `owner_kind`, `owner_id`, `object_key`, `filename`, `size_bytes`, `mime_type`, `scan_status`, `is_confidential`, `uploaded_by_id`, `uploaded_at` | `owner_kind` ∈ {`comment`, `assessment`}. `is_confidential` set only by its uploader acting from a Lini 3 position; cleared only with permission 25 |
| `PrintSnapshot` | `id`, `number`, `position_id`, `quarter_id`, `kind`, `version`, `trigger`, `is_provisional`, `superseded_by_id`, `payload` (JSONB), `photo_attachment_ids`, `created_by_user_id`, `created_at` | `kind` ∈ {`komunikasi`, `mutu`}; `trigger` ∈ {`print`, `auto_freeze`, `archive`}. Immutable (INV-22). `number` format `SIMARIO/[LK|LM]/[TA]/TW[n]/[kode unit]-[kode jabatan]/[urut]`, unique system-wide |
| `PrintPhotoSelection` | `position_id`, `quarter_id`, `section`, `attachment_ids`, `updated_by_user_id`, `updated_at` | FR-LBR-005 |
| `ThreadView` | `user_id`, `register_risk_id`, `last_seen_at` | Unseen-activity dots (FR-PPN-001) |
| `UserPreference` | `user_id`, `key`, `value` (JSONB) | Board filters per position, last-used position |
| `PageTiming` | `id`, `user_id`, `position_id`, `quarter_id`, `page`, `started_at`, `ended_at`, `active_ms` | Objective 8 instrumentation; active time only (tab visible, input within 2 minutes) |
| `ImportJob` | `id`, `kind`, `uploaded_by_user_id`, `object_key`, `status`, `row_count`, `error_count`, `report` (JSONB), `created_at`, `committed_at` | `kind` ∈ {`positions`, `holdings`, `assignments`}; `status` ∈ {`validated`, `failed`, `committed`} |
| `Notification` | `id`, `user_id`, `kind`, `text`, `target_url`, `read_at`, `created_at` | |
| `AuditLog` | `id`, `at`, `actor_user_id`, `acting_as`, `acting_position_id`, `action`, `entity_type`, `entity_id`, `before`, `after` | Append-only, enforced by trigger. Confidential-attachment access and Superadmin blind-view are logged as actions |

> **Removed in v2.2:** `Period`, `RegisterRevision`, `RegisterRiskTypeDeclaration` (replaced by `RegisterStageDeclaration`), `Assessment` per mitigation, `Evidence` (merged into `Attachment`), `ReviewDecision`, `ReviewNote`, `Stage.active_months`, `Stage.role_kind`, `Stage.tolerance_days`.

### 2.8.2 Lineage Across Years

A register copied from the previous fiscal year (FR-REG-009) creates new `RegisterRisk` rows in `draft` with `previous_year_risk_id` pointing at the source row and the **same `lineage_id`**. Risk History groups by `lineage_id`, so a risk that persists across years shows as one row with its full quarter history. A risk added fresh gets a new `lineage_id`.

### 2.8.3 Non-Retroactivity

1. **Wording is snapshotted** at selection; later template edits change nothing recorded.
2. **Published wording is immutable** (INV-7). Change means deactivate and add.
3. **Score bands are versioned.** Each assessment stores `score_band_version_id`; the predicate is computed and stored at finalise.
4. **Opened assessments are immutable** (INV-18).

### 2.8.4 Key Invariants

| # | Invariant |
|---|---|
| INV-1 | `Register` is unique on (`position_id`, `fiscal_year`) |
| INV-2 | `Position.code` is unique within `org_unit_id` |
| INV-3 | Exactly one `ScoreBandVersion` has `status = 'active'`; its bands cover 0.0–4.0 without gap or overlap |
| INV-26 | Within one `ScoreBandVersion`: every band's predicate has at least one `ScoreOption` whose value falls in it; option values and labels are unique; values are 0.0–4.0 with one decimal. Every non-null `Assessment.score` equals a `ScoreOption.value` of its version |
| INV-4 | A single-Pejabat position has at most one active `PositionOccupancy`; every position with at least one active occupancy has exactly one with `is_filler = true` |
| INV-5 | At least one active user holds a role with the manage-roles permission |
| INV-6 | `AuditLog` has no UPDATE or DELETE path; enforced by a database trigger |
| INV-7 | `description_snapshot` of a `RegisterRisk` or `RegisterMitigation` with `status != 'draft'` never changes |
| INV-8 | Every `RegisterRisk` carries either a `risk_template_id` or `is_custom = true` |
| INV-9 | A fiscal year's four quarters are contiguous and within the year; for each quarter `lini1_opens_on` ≤ `lini1_deadline` < `lini3_deadline` and `lini3_opens_on` ≤ `lini3_deadline` |
| INV-10 | An attachment with `scan_status != 'clean'` is never served |
| INV-11 | An active `PositionDelegate` requires its appointing `PositionOccupancy` to be active **and** to still have `is_filler = true` |
| INV-12 | An action whose permission has `requires_official = true` is performed only by a user holding an active `PositionOccupancy` with `is_filler = true` on the acting position |
| INV-13 | A user never holds both an occupancy and a delegation on the same position |
| INV-14 | A Lini 1 position has at most one active `MonitoringAssignment` covering any quarter |
| INV-15 | `Assessment` is unique on (`risk_quarter_id`, `assessor_position_id`) |
| INV-16 | Before an assessor's result for a risk opens, no API response to anyone other than that assessor's position holders contains that assessment's score, predicate, note, or attachments; and, per VIS-9, no response to a Lini 3 position whose own result for that risk has not opened contains any other assessment, result, explanation, or derived marker for it — across pages, derived views, snapshots, exports, notifications, and audit values. The only exception is FR-NIL-012 |
| INV-17 | A confidential attachment, or its filename, is served only to users whose effective permissions include permission 10 (VIS-3) |
| INV-18 | An `Assessment` that is part of an opened comparison result, or is `not_assessed`, is immutable; an `Assessment` is writable only on or after its line's `*_opens_on` |
| INV-19 | A `Comment` body is immutable 15 minutes after `created_at`; withdrawal sets `withdrawn_at` and never deletes the row |
| INV-20 | `RegisterRisk.stage_id` belongs to the register position's type |
| INV-21 | Nothing in an `archived` fiscal year is writable |
| INV-22 | A `PrintSnapshot` is never updated or deleted; `superseded_by_id` is the only field set after creation |
| INV-23 | A sent explanation is immutable |
| INV-24 | On a position with `allows_multiple_officials = true`, an action whose permission has `is_drafting = true` is performed only by the Pengisi or by an Operator of that position |
| INV-25 | Drafting, participation, finalising, and delegation are always performed from a holding on the **acting** position (the actor's own Lini 1, 2, or 3 position); no role, including Superadmin, bypasses this. Viewing and downloading follow scope only |

---

# 3. MODULE: AUTHENTICATION

### 3.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-AUT-001** | As a user, I want to sign in with my existing OIKN account so I do not have to remember another password. | Keycloak OIDC, NIP as identifier |
| **US-AUT-002** | As a user without a realm entry, I want a local account so that an SSO gap does not lock me out. | Fallback |
| **US-AUT-003** | As a local-account user, I want to be forced to change the initial password. | |
| **US-AUT-004** | As a user with more than one role, I want to switch the role view so the menu matches the work I am doing. | Menu only |
| **US-AUT-005** | As a user who works for several positions, I want to switch the position I am working for. | Operators often help more than one Pejabat |

### 3.2 Functional Requirements

| Code | Feature | Description | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|---|
| **FR-AUT-001** | **SSO sign-in** | Primary sign-in via Keycloak OIDC against the "Otorita IKN" realm. | • `/login` shows one primary button "Masuk dengan Akun Otorita IKN"<br>• The user is matched by `nip` from the token claim<br>• No matching `User` → "Akun Anda belum terdaftar di SIMARIO. Hubungi Superadmin, atau minta pejabat yang Anda bantu menunjuk Anda sebagai operator."; the attempt is audit-logged<br>• Matched but inactive → "Akun Anda tidak aktif. Hubungi Superadmin."<br>• Success → redirect to the originally requested URL, else `/` | BR-008 | High |
| **FR-AUT-002** | **Local account fallback** | A collapsed secondary form. | • Link "Masuk dengan akun lokal" expands NIP and password fields<br>• Failure → "NIP atau kata sandi tidak sesuai"<br>• Five consecutive failures → 15-minute lockout with the wait time stated<br>• Only accounts with `is_local_account = true` | BR-008 | High |
| **FR-AUT-003** | **Forced initial password change** | | • All routes except `/ganti-kata-sandi` redirect there while `must_change_password` is true<br>• Minimum 12 characters; must differ from the initial password | BR-008, NFR-002 | High |
| **FR-AUT-004** | **Self-service password change** | Local accounts only, from the avatar menu. | • Old, new, repeat<br>• Wrong old password → "Kata sandi lama tidak sesuai"<br>• Success → toast "Kata sandi berhasil diubah"; other sessions terminated | BR-008 | Medium |
| **FR-AUT-005** | **Password reset by Superadmin** | | • New initial password shown once<br>• Sets `must_change_password`<br>• Audit-logged without the value | BR-007 | High |
| **FR-AUT-006** | **Permanent identity marker** | | • `nip` unique and mandatory; changeable only by Superadmin, audit-logged<br>• `email` never used as an identity key | BR-009 | High |
| **FR-AUT-007** | **Role view switcher** | | • Shown when the user holds >1 role<br>• Changes the sidebar only, never a permission check | BR-008 | Medium |
| **FR-AUT-008** | **Session management** | | • 60 minutes idle → terminated, redirect to `/login` with "Sesi Anda berakhir. Silakan masuk kembali."<br>• Drafts autosaved first<br>• A change to the user's roles, permissions, holdings, or delegations invalidates their sessions | NFR-008 | Medium |
| **FR-AUT-009** | **Position switcher** | Users holding more than one position choose which one they work for. | • A switcher card in the sidebar, under the logo (design system §5), shows the eyebrow "JABATAN AKTIF" and the active position, e.g. "PPK A-1 · DDKB", with "Pejabat" or "Operator"<br>• Clickable when >1 holding; lists active holdings grouped by line<br>• Selecting a Lini 1 position navigates to its workspace; selecting a Lini 2 or 3 position navigates to Home in that capacity<br>• Visiting a `/jabatan/:jid/…` URL for a held position switches to it automatically<br>• An Operator sees a persistent note "Anda bekerja sebagai operator untuk [Jabatan]. Tindakan akhir dilakukan oleh [Nama Pejabat]."<br>• The last-used position is remembered per user | BR-015 | High |

### 3.3 Wireframes

> **Wireframe: Sign in (`/login`)**
>
> **Layout**
> - Single centred column, max 400 px; no sidebar, no topbar
>
> **Components**
> - Otorita IKN logo; title "SIMARIO", subtitle "Sistem Informasi Mitigasi Risiko Otorita IKN"
> - Primary button "Masuk dengan Akun Otorita IKN"
> - Divider, link "Masuk dengan akun lokal", collapsed NIP and password form with "Masuk"
> - Help text "Kendala masuk? Hubungi Superadmin unit Anda."
>
> **Behavior**
> - The local form stays collapsed until the link is clicked
> - Errors render as a red box above the fields

> **Wireframe: Change password (`/ganti-kata-sandi`)**
>
> **Layout**
> - Single centred column, max 400 px; no sidebar in forced mode
>
> **Components**
> - Title "Ganti Kata Sandi"; in forced mode "Kata sandi awal harus diganti sebelum melanjutkan."
> - Old password (hidden in forced mode), new, repeat; live requirement checklist; "Simpan"
>
> **Behavior**
> - Requirements tick as the user types; forced mode has no exit other than completing

### 3.4 Module Business Rules

| Code | Rule | Consequence |
|---|---|---|
| RB-AUT-001 | NIP is unique across all users | Duplicate rejected |
| RB-AUT-002 | An inactive user cannot sign in, but their data stays intact | Their comments, assessments, and audit entries remain visible |
| RB-AUT-003 | SIMARIO never creates an account from a sign-in alone | Accounts exist only when a Superadmin provisions them or a Pejabat appoints the person as Operator |
| RB-AUT-004 | An account created through delegation carries no manual role | When its last delegation ends it is deactivated automatically, data intact — **unless** the user holds an occupancy or a manual role |

---

# 4. MODULE: HOME

Home content follows the position selected in the switcher and the line of that position.

### 4.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-BRD-001** | As Lini 1, I want to see every assessment I still owe, whichever fiscal year it belongs to, and how far I am. | In January that includes last year's TW IV |
| **US-BRD-002** | As Lini 1, I want a list of what needs my action now. | Explanations due, quiet risks, drafts to publish |
| **US-BRD-003** | As Lini 1, I want last quarter's result at a glance. | Mini Lembar Mutu |
| **US-BRD-004** | As Lini 2, I want to see the positions I coordinate and where it is quiet. | No deadline cards — Lini 2 does not assess |
| **US-BRD-005** | As Lini 3, I want my directorate's assessment queue and the risks that need attention. | |
| **US-BRD-006** | As Superadmin, I want to see configuration gaps before they become user problems. | |
| **US-BRD-007** | As any participant, I want recent activity on threads I follow. | |

### 4.2 Functional Requirements

| Code | Feature | Description | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|---|
| **FR-BRD-001** | **Assessment obligation cards (Lini 1)** | One card per **open obligation**, from any fiscal year, not per calendar quarter. | • An obligation exists for a quarter from `lini1_opens_on` while any risk of that quarter has an unfinalised Lini 1 assessment and its comparison has not opened<br>• Card: "Penilaian TW [n] [TA]", the Lini 1 deadline and days remaining (amber ≤7 days, red after with the lateness marker), progress "[x] dari [y] risiko sudah dituntaskan", button "Buka Penilaian"<br>• Several cards may show at once, e.g. TW IV of the previous year and TW I of the current year; ordered by deadline<br>• Before `lini1_opens_on`: one muted line "Penilaian TW [n] dibuka mulai [tanggal]"<br>• No card when nothing is owed | BR-004, BR-012 | High |
| **FR-BRD-002** | **Action card (Lini 1)** | Items needing action, most urgent first. | • Explanations due, from any fiscal year: "[n] hasil Tidak Sesuai menunggu penjelasan", with the earliest deadline<br>• Quiet risks: "[n] risiko belum ada langkah triwulan ini"<br>• Pejabat only: "[n] draf siap dari operator" (register or assessment)<br>• Each line links to the filtered page; the card hides when empty | BR-012, BR-016, BR-018 | High |
| **FR-BRD-003** | **Register status card (Lini 1)** | Shown when the current fiscal year's register is not published. | • "Register TA [tahun] belum diterbitkan" with the register status<br>• Buttons "Buka Register" and, when a previous-year register exists and the current one is empty, "Salin dari TA [tahun-1]" | BR-001 | High |
| **FR-BRD-004** | **Last quarter result (Lini 1)** | Mini Lembar Mutu for the most recent quarter in which at least one result has opened; figures follow VIS-7. | • One row per risk type: predicate for Lini 1 and each Lini 3 position (from the average score, not shown)<br>• Count of Tidak Sesuai and Berulang<br>• Link to `/jabatan/:jid/lembar/:ta/:tw` | BR-011 | Medium |
| **FR-BRD-005** | **Coordinated positions (Lini 2)** | The Lini 1 positions assigned to the user for the current quarter or for any quarter that still has an open obligation. | • One row per position: name, work unit, count of risks assessed in the current quarter (RB-REG-006), quiet risk count this quarter, last activity time<br>• Sorted by quiet risk count, descending<br>• Click → that position's board<br>• No unanswered-comment indicator (decision of 10 October 2026) | BR-016 | High |
| **FR-BRD-006** | **Assessment obligation cards (Lini 3)** | One card per quarter, from any fiscal year, in which the directorate still has unfinalised risks whose comparison has not fully opened. | • "TW [n] [TA]: [x] dari [y] risiko sudah dinilai oleh [Direktorat]" with the Lini 3 deadline<br>• Ordered by deadline; link to `/penilaian` filtered to that quarter | BR-005 | High |
| **FR-BRD-007** | **Attention card (Lini 3)** | Risks needing quality-assurance attention; counts include only risks whose result for the user's own directorate has opened (VIS-9). | • Counts of Tidak Sesuai, Berulang, and "Tidak dinilai Lini 1" for the latest opened quarter<br>• Each links to `/penilaian` filtered | BR-005, BR-006 | High |
| **FR-BRD-008** | **Configuration health (Superadmin)** | | • Positions without a Pejabat<br>• Lini 1 positions without a monitoring assignment this quarter<br>• Lini 1 positions whose current register is not published<br>• Quarters of the current fiscal year without deadlines<br>• Each count links to the page that fixes it | BR-008 | Medium |
| **FR-BRD-009** | **Recent activity** | Latest comments on threads the user follows. | • 10 most recent, excluding the user's own<br>• Each: line chip, author, position, risk wording excerpt, relative time<br>• Click → the thread anchored at the comment | BR-016 | Medium |
| **FR-BRD-010** | **Composition** | Cards shown follow the current holding's line and the user's permissions. | • Lini 1: 001, 002, 003, 004, 009<br>• Lini 2: 005, 009<br>• Lini 3: 006, 007, 009<br>• Superadmin adds 008<br>• A user with no holding and only PMD sees a short welcome with links to Master Data | BR-008 | High |
| **FR-BRD-011** | **Position lists** | Entry points into other positions' workspaces. | • `/pantauan` (Lini 2): FR-BRD-005 as a full page with search<br>• `/jabatan`: all Lini 1 positions within scope; columns Position, Work Unit, Type, Register status, Quiet risks, Last activity; filters by work unit and type | BR-016 | High |

### 4.3 Wireframes

> **Wireframe: Home (`/`)**
>
> **Layout**
> - Sidebar 240 px; content max 1200 px; two-column card grid above 900 px, single column below
>
> **Components**
> - Greeting line with the active position and capacity
> - Cards per FR-BRD-010
> - Empty state when no card applies: "Tidak ada yang perlu Anda kerjakan saat ini."
>
> **Behavior**
> - Switching position in the sidebar switcher reloads the cards
> - Each count is a link to a filtered view

> **Wireframe: Position lists (`/pantauan`, `/jabatan`)**
>
> **Layout**
> - Sidebar 240 px; single column, full-width table; stacked cards below 900 px
>
> **Components**
> - Search field, work unit and type filters; table per FR-BRD-011
>
> **Behavior**
> - Click a row → `/jabatan/:jid/papan/:ta`

---

# 5. MODULE: RISK REGISTER

One register per Lini 1 position per fiscal year. Built at the start of the year, published by the Pejabat, extended during the year when needed.

### 5.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-REG-001** | As Lini 1, I want to pick risks and mitigations from a prepared list for each of my stages. | Templates by risk owner type and stage |
| **US-REG-002** | As Lini 1, I want to start this year from last year's register. | Copy keeps history |
| **US-REG-003** | As Lini 1, I want to add my own risk or mitigation when the list does not fit. | Becomes a proposal |
| **US-REG-004** | As Lini 1, I want to declare that a stage or a risk type does not apply to me this year, with a reason. | Honest escape hatch |
| **US-REG-005** | As an Operator, I want to prepare the register and tell the Pejabat it is ready. | |
| **US-REG-006** | As a Pejabat, I want to publish the register so it appears on the board. | Finalising action |
| **US-REG-007** | As Lini 1, I want to add a risk mid-year without republishing everything. | |
| **US-REG-008** | As Lini 1, I want to retire a risk that no longer applies, keeping its history. | Deactivate with reason |

### 5.2 Functional Requirements

| Code | Feature | Description | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|---|
| **FR-REG-001** | **Data Umum** | Register header, filled once per year. | • Fixed fields: Tujuan (prefilled with the form's default objective, editable), Kegiatan (list, add/remove rows), Besar Anggaran (Rp), Target (textarea)<br>• Additional fields from the position type's `DataUmumForm`<br>• Identity block read-only from the position and current Pejabat holding: name, position, and the type's identity fields (e.g. Nama Satker, Nomor DIPA Petikan for KPA; Nomor dan Tanggal SK for PPK and Pokja)<br>• Editable by Lini 1 after publish; changes audit-logged | BR-001 | High |
| **FR-REG-002** | **Stage sections** | One collapsible section per active stage of the risk owner type, in stage order. | • Stage sections start **collapsed**; the header still shows counts and "Tidak relevan"<br>• Each stage holds three risk type sub-sections: Kinerja Anggaran, Ketidakpatuhan, Kecurangan, shown as indented sub-items; each is collapsible and starts **expanded**<br>• A publish gap opens its stage and sub-section so the gap list can scroll to it<br>• Section header shows counts of selected risks per type<br>• "Tahap ini tidak relevan tahun ini" toggle at stage level, with a mandatory reason; collapses the stage | BR-001 | High |
| **FR-REG-003** | **Risk cards** | Template risks for that stage and type, as selectable cards. | • Card shows risk wording; selecting expands it to show its mitigation templates as checkboxes<br>• Mitigations are **not** pre-ticked<br>• "+ Mitigasi sendiri" adds a custom mitigation under the risk<br>• Search within the stage | BR-002 | High |
| **FR-REG-004** | **Custom risk** | Lini 1 adds a risk not in the templates. | • "+ Risiko sendiri" in each risk type sub-section: wording (mandatory), at least one mitigation recommended<br>• Saved with `is_custom = true`; on publish also creates a `RiskProposal` | BR-002 | High |
| **FR-REG-005** | **"Tidak ada risiko" declaration** | Per stage and risk type. | • Checkbox "Tidak ada risiko pada jenis ini" with a mandatory reason<br>• Mutually exclusive with selected risks in that sub-section | BR-001, BR-013 | High |
| **FR-REG-006** | **Mark ready (Operator)** | An Operator hands over to the Pejabat. | • Bottom bar button "Tandai Siap Diterbitkan" for Operators<br>• Status `draft` → `ready`; the Pejabat is notified<br>• Any further edit returns status to `draft` | BR-015 | High |
| **FR-REG-007** | **Publish (Pejabat)** | The Pejabat publishes the register. | • Bottom bar button "Terbitkan Register", Pejabat only (INV-12)<br>• Validation per §2.6: blocks only on a risk type sub-section with neither risks nor declaration, and on declarations without reason; the button lists the gaps<br>• Risks without mitigation publish with flag `no_mitigation`, named in the dialog<br>• Confirmation dialog: "Register akan diterbitkan. Risiko dan mitigasi yang diterbitkan tidak dapat diubah uraiannya."<br>• On confirm: risks and mitigations become `active`, wording locked (INV-7), threads appear on the board, Lini 2 notified | BR-001, BR-013, BR-015 | High |
| **FR-REG-008** | **Mid-year additions** | New risks or mitigations after publish. | • A published register remains editable for additions only<br>• New items are `draft`; Operators mark them `ready` and listed in a "Belum diterbitkan" strip at the top<br>• Operators mark them ready; the Pejabat publishes them with "Terbitkan Tambahan"<br>• Added risks are assessed from the quarter in which they are published<br>• Adding a risk to a sub-section that carries "Tidak ada risiko" removes that declaration after a confirmation; a stage declared "tidak relevan" must have the declaration cleared first<br>• No Lini 2 confirmation (decision of 10 October 2026) | BR-001 | High |
| **FR-REG-009** | **Copy from previous year** | Starts a new register from last year's. | • Offered only when the current register has no risks<br>• Copies Data Umum (except Besar Anggaran and Target, cleared), every **active** risk and mitigation as `draft`, and stage declarations<br>• Copied risks keep `lineage_id` and set `previous_year_risk_id`<br>• Risks whose template is now inactive are copied with a "Template sudah tidak aktif" marker<br>• Risks whose stage is now inactive are **not** copied; they are listed in the copy summary as "Tidak disalin: tahap [nama] tidak aktif"<br>• Nothing is published by copying | BR-001, BR-011 | High |
| **FR-REG-010** | **Deactivate a risk or mitigation** | Retire an item without losing history. | • Action "Nonaktifkan" on a published item, Pejabat only, mandatory reason<br>• `status` becomes `inactive` immediately and `deactivated_from_quarter_id` is set to the next quarter (null when deactivated in TW IV); the item is still assessed in the current quarter and in every view is treated as active for quarters before `deactivated_from_quarter_id`<br>• Inactive items are never copied to the next year<br>• Deactivating the last active mitigation of a risk sets the risk's `no_mitigation` flag<br>• The thread stays readable with the "Nonaktif sejak TW [n]" badge (n = the quarter of `deactivated_from_quarter_id`; when deactivated in TW IV the badge reads "Nonaktif mulai TA [tahun+1]"); commenting stays open until archive | BR-007, BR-011 | High |
| **FR-REG-011** | **Draft deletion** | Unpublished items can be removed. | • Draft risks and mitigations can be deleted outright; published items cannot | BR-007 | Medium |
| **FR-REG-012** | **Read-only view** | Lini 2, Lini 3, and readers in scope. | • Same layout without selection controls; deactivated items shown dimmed<br>• Flags visible | BR-016 | High |
| **FR-REG-013** | **Archived register** | | • Read-only after the fiscal year is archived (INV-21) | BR-007 | High |

### 5.3 Wireframe

> **Wireframe: Register (`/jabatan/:jid/register/:ta`)**
>
> **Layout**
> - Workspace header and tabs; single content column, max 1000 px
> - Persistent bottom bar
>
> **Components**
> - Status chip: Draf / Siap Diterbitkan / Terbit (+ "[n] tambahan belum diterbitkan")
> - "Salin dari TA [tahun-1]" banner when applicable
> - Data Umum card
> - Stage sections (collapsible), each with three risk type sub-sections, risk cards, "+ Risiko sendiri", "Tidak ada risiko pada jenis ini"
> - Bottom bar: autosave indicator; gap count; Operator: "Tandai Siap Diterbitkan"; Pejabat: "Terbitkan Register" / "Terbitkan Tambahan"
>
> **Behavior**
> - Selecting a risk card expands its mitigations
> - Pressing publish with gaps scrolls to and highlights the first gap
> - After publish, published cards show a lock icon and a "Nonaktifkan" action in their menu

### 5.4 Module Business Rules

| Code | Rule | Consequence |
|---|---|---|
| RB-REG-001 | One register per Lini 1 position per fiscal year (INV-1) | A second is rejected |
| RB-REG-002 | Stages and templates come from the position's risk owner type | Two PPKs see the same templates; their registers differ |
| RB-REG-003 | Published wording never changes (INV-7) | Change = deactivate with reason + add new |
| RB-REG-004 | A risk without mitigation is a flag, not a block | Visible on board, assessment, and print |
| RB-REG-005 | Only the Pejabat publishes or deactivates | Operators prepare and mark ready |
| RB-REG-006 | A risk is assessed from the quarter in which it is published up to, but not including, `deactivated_from_quarter_id` | Determines `RiskQuarter` creation and every per-quarter filter, independent of `status` |

### 5.5 Dependencies

- Depends on: stages, templates, Data Umum forms (MST); positions and holdings (ADM); fiscal years (ADM)
- Prerequisite for: PPN, NIL, RWY, LBR

---

# 6. MODULE: RISK BOARD

Every active risk is a thread; every mitigation under it is a sub-thread. The three lines coordinate here, and what they write here becomes the Lembar Komunikasi (BR-016). Threads live for the whole fiscal year.

### 6.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-PPN-001** | As any participant, I want all risks of a position on one board, filterable, with what changed recently. | |
| **US-PPN-002** | As Lini 1, I want to record what I did on a risk or mitigation, with photos and documents. | "Langkah" |
| **US-PPN-003** | As Lini 2, I want to give solutions and advice on a specific risk or mitigation. | Coordinative, not judging |
| **US-PPN-004** | As Lini 3, I want to comment, and to attach material only Lini 3 may see. | Confidential |
| **US-PPN-005** | As any participant, I want to mention someone so they are told. | @mention |
| **US-PPN-006** | As any participant, I want to see at a glance which risks have had no Lini 1 action this quarter. | Quiet marker |
| **US-PPN-007** | As a participant, I want to fix a typo right after posting, but nobody should be able to rewrite history later. | 15-minute window |
| **US-PPN-008** | As a follower, I want to stop notifications from a thread I no longer need. | Not for the position's own holders |

### 6.2 Functional Requirements

| Code | Feature | Description | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|---|
| **FR-PPN-001** | **Board list** | All published risks of the position for the selected fiscal year. | • Grouped by stage › risk type, in stage order<br>• Row: risk wording, mitigation count, comment counts per line (L1 · L2 · L3), last activity time, latest opened predicate chips (L1, each Lini 3), markers<br>• Markers: "Belum ada langkah triwulan ini", "Tidak Sesuai", "Berulang", "Tanpa mitigasi", "Nonaktif sejak TW [n]"<br>• Filters: stage, risk type, marker, "Ada aktivitas sejak kunjungan terakhir"<br>• Rows with unseen activity since the user's last visit show a dot | BR-016 | High |
| **FR-PPN-002** | **Thread page** | One risk and its mitigation sub-threads. | • Header: wording, stage, risk type, status, flags; "Riwayat TA sebelumnya" link when `previous_year_risk_id` exists<br>• Main timeline: risk-level comments, grouped by quarter with dividers "TW I", "TW II"…<br>• Mitigation sub-threads beneath: each collapsible, with wording, comment count, last activity, and its own timeline grouped by quarter<br>• Right panel: per-quarter assessment summary following VIS-1/VIS-2, link to the assessment page<br>• Deep link to a comment scrolls to and highlights it | BR-016 | High |
| **FR-PPN-003** | **Posting a comment** | Participants (§1.5) post on a risk or a mitigation. | • Plain text with line breaks; up to 5,000 characters<br>• Author line chip is set automatically from the acting holding; Operators show "sebagai Operator [Jabatan]"<br>• Non-participants within scope see the timeline without the composer and the note "Anda dapat membaca utas ini."<br>• While the current quarter's comparison for this risk has not opened, the Lini 3 composer shows: "Perbandingan triwulan ini belum dibuka. Hindari menyebutkan skor atau predikat penilaian Anda di utas ini."<br>• "Terkait TW [n]" selector appears only when an earlier quarter of the same fiscal year has an open comparison or pending explanation for this risk; default is the posting quarter (RB-PPN-004). **"Tandai sebagai Langkah" is unavailable when an earlier quarter is chosen** — a Langkah always belongs to the quarter in which it is posted, so it can never clear an earlier quarter's quiet marker or appear in an earlier Section A<br>• Posting subscribes the author to the thread | BR-016 | High |
| **FR-PPN-004** | **Langkah** | Lini 1 marks a comment as an action taken. | • "Tandai sebagai Langkah" checkbox in the composer, shown only to Lini 1 participants<br>• Langkah comments carry a "Langkah" badge<br>• A Langkah on a risk or any of its mitigations clears that risk's quiet marker for the quarter | BR-016 | High |
| **FR-PPN-005** | **Attachments** | Files on a comment. | • Up to 10 files per comment; formats and size per NFR-009<br>• Scanning per NFR-010; "Memindai…" until clean<br>• Images and video show a thumbnail; others an icon with filename and size<br>• Quota per NFR-012 | BR-014 | High |
| **FR-PPN-006** | **Confidential attachments** | Lini 3 can restrict files. | • Lini 3 participants see a "Konfidensial" toggle per file in the composer; default off on comments<br>• Confidential files are served per VIS-3/INV-17; others see "[n] lampiran konfidensial"<br>• The toggle can be switched on later by the uploader; switching off requires permission 25, audit-logged | BR-017 | High |
| **FR-PPN-007** | **Mentions** | Notify a specific participant. | • Typing "@" opens a picker of participants of this position's threads (§1.5), searchable by name or position<br>• Mentioned users receive a notification (FR-NTF-003) and are subscribed<br>• Mentioning a non-participant is not offered | BR-016 | Medium |
| **FR-PPN-008** | **Edit and withdraw** | | • The author may edit within 15 minutes of posting; "(disunting)" shown afterwards<br>• After 15 minutes the body is immutable (INV-19)<br>• The author may withdraw at any time: the comment becomes "Komentar ditarik oleh [nama] pada [waktu]" (VIS-6); attachments are hidden but retained<br>• Withdrawing a Langkah may re-raise the quiet marker | BR-007 | High |
| **FR-PPN-009** | **Quiet marker** | Shows where Lini 1 has been silent. | • Computed per risk assessed in the quarter (RB-REG-006), whatever its `status`: no Langkah from Lini 1 on the risk or any of its mitigations in the current quarter<br>• Shown on the board, the thread header, Home, and the Lembar Komunikasi<br>• Never blocks anything | BR-012, BR-016 | High |
| **FR-PPN-010** | **Subscriptions** | Who is told about new comments. | • Always subscribed, cannot mute: Pejabat and Operators of the position<br>• Auto-subscribed, can mute: anyone who posted or was mentioned<br>• "Ikuti" / "Berhenti mengikuti" button on the thread header | BR-016 | Medium |
| **FR-PPN-011** | **Freshness** | | • Polling per NFR-015; banner "[n] komentar baru — Tampilkan" | BR-016 | Medium |
| **FR-PPN-012** | **Archived threads** | | • Read-only after archive; composer hidden; "Utas ini diarsipkan pada [tanggal]" | BR-007 | High |

### 6.3 Wireframes

> **Wireframe: Risk Board (`/jabatan/:jid/papan/:ta`)**
>
> **Layout**
> - Workspace header and tabs; filter row; grouped list, max 1200 px; stacked cards below 900 px
>
> **Components**
> - Filter row: stage, risk type, marker pills, "Ada aktivitas baru" toggle
> - Stage headers with risk type sub-headers
> - Risk rows per FR-PPN-001
> - Empty state when unpublished: "Register TA [tahun] belum diterbitkan." with "Buka Register" for Lini 1
>
> **Behavior**
> - Click a row → thread page
> - Filters persist per user per position

> **Wireframe: Risk thread (`/jabatan/:jid/papan/:ta/risiko/:rid`)**
>
> **Layout**
> - Two columns above 900 px: timeline (flexible) and a 300 px right panel; single column below with the panel collapsed above the timeline
>
> **Components**
> - Header: wording, chips (stage, type, status, flags), "Ikuti" button
> - Risk timeline with quarter dividers; each comment: avatar, name, line chip, capacity, time, body, attachments, "Langkah" badge, menu (Sunting within 15 min · Tarik)
> - Composer: textarea with @mention, attach button, "Tandai sebagai Langkah" (Lini 1), "Konfidensial" per file (Lini 3), "Kirim"
> - Mitigation sub-threads below, each collapsible with its own timeline and composer
> - Right panel: quarter cards with assessment state per VIS-1/VIS-2
>
> **Behavior**
> - Enter inserts a line break; Ctrl+Enter sends
> - New comments appear via the "komentar baru" banner
> - Opening a mitigation sub-thread updates the URL fragment `#mitigasi-:mid`

### 6.4 Module Business Rules

| Code | Rule | Consequence |
|---|---|---|
| RB-PPN-001 | Participation is narrower than visibility (§1.5) | Readers in scope cannot post |
| RB-PPN-002 | Lini 2 comments are coordination, not assessment | No Lini 2 field exists anywhere else |
| RB-PPN-003 | Comments are evidence; nothing is ever deleted | Edit window 15 minutes; withdrawal keeps the original in audit |
| RB-PPN-004 | A comment belongs to the quarter of the thread's own fiscal year in which it was posted (after year-end: TW IV) — unless, while an earlier quarter of the same fiscal year still has an open comparison or a pending explanation for that risk, the author picks that earlier quarter in "Terkait TW [n]" | The chosen quarter determines its place in the Lembar Komunikasi and the Lini 2 assignment that governs participation |

### 6.5 Dependencies

- Depends on: REG, ADM (holdings, assignments), NTF
- Prerequisite for: LBR, BRD

---

# 7. MODULE: QUARTERLY ASSESSMENT

Each quarter, Lini 1 scores every active risk; each Lini 3 position scores the same risks independently. The predicates are compared; where Lini 1 is more optimistic, Lini 1 explains.

```
TW n  lini1_opens_on ── Lini 1 drafts → Pejabat finalises (per risk) ── lini1_deadline
      lini3_opens_on ── Kepatuhan drafts → Pejabat finalises (per risk) ─┐
      lini3_opens_on ── PAI drafts → Pejabat finalises (per risk) ───────┴── lini3_deadline
                                                 │
            per risk: all finalised, or lini3_deadline passed
                                                 ▼
                         Comparison result opens (per Lini 3 position)
                         Sesuai / Tidak Sesuai
                                                 │
                         Tidak Sesuai and Lini 1 higher
                                                 ▼
                         Lini 1 explanation for that result ── opened_at + 5 working days
```

### 7.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-NIL-001** | As Lini 1, I want to score every risk for the quarter in one page and attach evidence. | |
| **US-NIL-002** | As Lini 1, I want to say a risk was not relevant this quarter, with a reason, instead of inventing a score. | "Belum relevan" |
| **US-NIL-003** | As a Pejabat, I want my Operator to prepare scores and to finalise them myself. | |
| **US-NIL-004** | As Lini 3, I want to score each risk without seeing what anyone else gave it. | Blind |
| **US-NIL-005** | As Lini 3, I want to write my reasoning and attach confidential material. | |
| **US-NIL-006** | As Lini 3, I want a queue of what my directorate still has to assess across all positions. | |
| **US-NIL-007** | As any participant, I want to see the comparison once it opens. | |
| **US-NIL-008** | As Lini 1, when I rated higher than Lini 3, I want to explain the obstacle and my plan. | |
| **US-NIL-009** | As Lini 3 and Lini 2, I want to be told when an explanation arrives. | |

### 7.2 Functional Requirements

| Code | Feature | Description | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|---|
| **FR-NIL-001** | **Assessment page** | One page per position per quarter; content depends on the viewer. | • Header: "Penilaian TW [n] [TA]", Lini 1 deadline, Lini 3 deadline, comparison status (Menunggu / Terbuka sebagian / Terbuka)<br>• Risks listed by stage › risk type; only risks active in the quarter (RB-REG-006)<br>• The viewer's own column is editable when they may assess (FR-NIL-002, 005); other columns follow VIS-1/VIS-2<br>• Quarter selector to move between TW I–IV<br>• Outside the viewer's assessment window (§2.5) the page is read-only with "Penilaian TW [n] dibuka mulai [tanggal]" | BR-004, BR-005 | High |
| **FR-NIL-002** | **Lini 1 score entry** | | • Per risk: a dropdown of the quarter version's score options, a flat list from worst to best, statements only (no numbers), first entry "— Pilih penilaian —"; the predicate badge appears once a statement is chosen<br>• Attach files (up to 10, NFR-009); "Belum relevan triwulan ini" checkbox with mandatory reason, which disables the score<br>• Help text links to the scoring guidance (OQ-1)<br>• Autosave per row | BR-004 | High |
| **FR-NIL-003** | **Lini 1 mark ready and finalise** | Finalising is **per risk** (§2.5). | • Operator: "Tandai Siap" marks every scored draft row `ready`; Pejabat notified<br>• Pejabat: "Tuntaskan Penilaian" (INV-12) finalises every row that has a score or a "Belum relevan" declaration; unscored rows are untouched and stay fillable<br>• The button can be pressed again later for rows scored afterwards, including risks published mid-quarter<br>• Dialog: "[x] risiko akan dituntaskan. [z] risiko belum dinilai dan tetap dapat diisi sampai perbandingannya dibuka."<br>• Rows without attachment are flagged `no_evidence` and named in the dialog<br>• Lateness fixed per row at this moment (§2.5) | BR-004, BR-013, BR-015 | High |
| **FR-NIL-004** | **Lini 1 reopen** | Per risk. | • The Pejabat may reopen a finalised row with "Buka Kembali" while that risk's comparison has not opened<br>• Once the risk's comparison opens (fully or partially) the row is immutable (INV-18) and the action is gone for it | BR-004 | High |
| **FR-NIL-005** | **Lini 3 score entry** | Each Lini 3 position assesses separately. | • Same score option dropdown and predicate as FR-NIL-002, plus an optional **note** at every score (no gate, §2.6)<br>• Attachments confidential by default (VIS-4); toggle per file<br>• No Lini 1 score, other Lini 3 score, or other Lini 3 note is visible (VIS-1). The Lini 1 thread and Lini 1 **comment** attachments are visible; Lini 1 **assessment** attachments are not, until this directorate's own result opens<br>• "Belum relevan" is not offered to Lini 3; a risk Lini 1 marked not relevant is still scored by Lini 3<br>• Keyboard entry for volume: Tab moves to the next risk's score; a position filter and a "Belum dinilai saja" toggle | BR-005, BR-017 | High |
| **FR-NIL-006** | **Lini 3 mark ready and finalise** | Per risk, as Lini 1. | • Operator "Tandai Siap"; Pejabat of the directorate "Tuntaskan Penilaian" (INV-12) finalises scored rows only<br>• Per-row "Buka Kembali" until that directorate's result for the risk opens<br>• Lateness fixed per row at finalise | BR-005, BR-015 | High |
| **FR-NIL-007** | **Comparison** | Opens per §2.5. | • For each opened Lini 3 position: result **Sesuai** when its predicate equals Lini 1's, **Tidak Sesuai** otherwise<br>• Risk shows ✓ when every opened result is Sesuai, ✕ when any is Tidak Sesuai<br>• Lini 1 "Belum relevan" or "Tidak dinilai Lini 1" → result "Tidak dapat dibandingkan"<br>• Once a result opens: its chosen statements, predicates, Lini 3 note, and non-confidential attachments are visible to everyone in scope (VIS-2), except to a Lini 3 position whose own result for that risk has not opened (VIS-9)<br>• Participants of the position are notified (FR-NTF-007) | BR-005 | High |
| **FR-NIL-008** | **Explanation** | Lini 1 explains a mismatch, **per comparison result** (per Lini 3 directorate). | • One explanation block per Tidak Sesuai result, labelled with the directorate<br>• **Mandatory** when Lini 1's predicate is higher than that directorate's; **optional** when lower<br>• Fields: "Alasan/Kendala" and "Rencana Tindak Lanjut", both mandatory when the explanation is mandatory<br>• When two results of the same risk are pending together, a checkbox "Gunakan penjelasan yang sama untuk [Direktorat lain]" copies the text; each result is still stored and sent separately<br>• Deadline: that result's `opened_at` + `explanation_workdays`; reminder H-1<br>• Operator drafts and marks ready; the Pejabat sends with "Kirim Penjelasan"; lateness fixed at send<br>• Sent explanations are immutable (INV-23), visible to everyone in scope except per VIS-9; Lini 2 and Lini 3 notified<br>• Not sent by archive → "Tidak dikirim"<br>• No further formal step; Lini 3 responds on the thread | BR-018 | High |
| **FR-NIL-009** | **Partial comparison and late Lini 3** | | • When a Lini 3 position finalises after a partial opening, its result opens at that moment, recomputing the risk's ✓/✕<br>• A Tidak Sesuai result at that point creates its own explanation obligation and deadline (FR-NIL-008)<br>• If the quarter's sheets were already frozen, a new sheet version is created when that obligation closes (FR-LBR-009) | BR-005, BR-012 | High |
| **FR-NIL-010** | **Lini 3 queue** | `/penilaian` | • Rows: position, work unit, risk owner type, quarter, "[x]/[y] dinilai", status (Belum dimulai / Draf / Siap / Dituntaskan), Lini 1 status (Dituntaskan / Belum)<br>• Filters: quarter, work unit, type, status; plus attention filters Tidak Sesuai, Berulang, Tidak dinilai Lini 1 — applied only to risks whose result for the user's directorate has opened (VIS-9)<br>• Defaults to the quarter with the earliest open Lini 3 deadline and the user's directorate<br>• Positions whose register for that fiscal year is not yet published are listed with status "Register belum terbit" and no risk count<br>• Click → that position's assessment page | BR-005 | High |
| **FR-NIL-011** | **Recurring detection** | | • After each comparison result opens, a task checks each risk: at least one Lini 3 predicate Kurang Terkendali in this quarter **and** at least one in the previous quarter — not necessarily from the same directorate — matched on `lineage_id`, crossing fiscal years<br>• Sets `recurring` on the `RiskQuarter`; shows the "Berulang" marker; notifies per FR-NTF-008<br>• When a quarter's result opens late, the following quarter of the same lineage is re-evaluated as well, so a late TW II result can mark TW III<br>• The Berulang marker and its notification are withheld from a Lini 3 position whose own result for that risk has not opened (VIS-9)<br>• Idempotent | BR-006 | High |
| **FR-NIL-012** | **Superadmin blind view** | | • Users with permission 24 (Superadmin by default) can view any assessment before opening, after confirming "Melihat penilaian sebelum perbandingan dibuka akan tercatat di jejak audit."<br>• Logged per view | BR-007 | Medium |

### 7.3 Wireframes

> **Wireframe: Quarterly assessment (`/jabatan/:jid/penilaian/:ta/:tw`)**
>
> **Layout**
> - Workspace header and tabs; content max 1200 px; persistent bottom bar
> - Above 900 px a table-like list; below, one card per risk
>
> **Components**
> - Header strip: quarter selector, deadlines, comparison status, lateness markers
> - Per risk row before opening: wording, stage/type chips, quiet marker; the viewer's column (score option dropdown, predicate badge, attach, "Belum relevan" for Lini 1, note for Lini 3); other columns show "Tersembunyi sampai perbandingan dibuka"
> - Per risk row after opening: columns L1 · [each Lini 3 position] with the chosen statement and predicate; ✓/✕; Lini 3 notes expandable; explanation form or sent explanation beneath Tidak Sesuai rows
> - Bottom bar: progress "[x] dari [y] dituntaskan · [z] belum dinilai"; Operator "Tandai Siap"; Pejabat "Tuntaskan Penilaian"; per-row menu "Buka Kembali"; for explanations "Kirim Penjelasan" with count
> - Window banner when outside the viewer's assessment window
>
> **Behavior**
> - Choosing a statement shows its predicate badge instantly; a score that is not an option of the quarter's version is refused with "Pilihan penilaian tidak dikenal."
> - Pressing Tuntaskan opens the summary dialog per FR-NIL-003
> - Rows with Tidak Sesuai and mandatory explanation are pinned to the top for Lini 1 after opening

> **Wireframe: Lini 3 queue (`/penilaian`)**
>
> **Layout**
> - Sidebar 240 px; single column, full-width table; stacked cards below 900 px
>
> **Components**
> - Quarter selector, directorate label, deadline; filter row; table per FR-NIL-010
>
> **Behavior**
> - Click a row → assessment page of that position and quarter

### 7.4 Module Business Rules

| Code | Rule | Consequence |
|---|---|---|
| RB-NIL-001 | The object of assessment is the risk, per quarter; mitigations are not assessed | One score per assessor per risk per quarter |
| RB-NIL-002 | A statement is selected and its value is stored as the score; the predicate is derived from the quarter's `score_band_version_id` and stored at finalise | Every predicate in one quarter uses one band version; changing bands never changes a past predicate |
| RB-NIL-003 | Comparison uses predicates, not scores | 2.9 vs 3.1 differ; 2.1 vs 2.9 do not |
| RB-NIL-004 | Assessments are blind until the comparison opens (VIS-1) | Enforced at the API (INV-16) |
| RB-NIL-005 | A comparison opening freezes the assessments in it (INV-18) | Lini 1 cannot adjust a score after seeing Lini 3's |
| RB-NIL-008 | Finalising and reopening are per risk | A partial finalise never blocks later entry of other risks |
| RB-NIL-009 | Explanations belong to a comparison result, not to a risk | A late directorate's mismatch is explained on its own |
| RB-NIL-006 | An explanation is mandatory only when Lini 1 is more optimistic than Lini 3 | Pessimism by Lini 1 is not penalised |
| RB-NIL-007 | Lateness is marked, never locked, except the freeze in RB-NIL-005 | Late assessments still count |

### 7.5 Dependencies

- Depends on: REG (active risks), MST (score bands), ADM (quarters, holdings)
- Prerequisite for: RWY, LBR, BRD, NTF

---

# 8. MODULE: RISK HISTORY

The only page that returns value to the person doing the data entry: their own risks across quarters and years, with every assessor's view side by side.

### 8.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-RWY-001** | As Lini 1, I want to see how each of my risks was rated by me and by Lini 3, quarter by quarter. | |
| **US-RWY-002** | As Lini 1, I want a risk carried from last year to show its whole history. | Lineage |
| **US-RWY-003** | As Lini 2 or Lini 3, I want the same history for the positions I cover. | Scope |
| **US-RWY-004** | As any reader, I want the quarter summary per risk type. | Lembar Mutu |

### 8.2 Functional Requirements

| Code | Feature | Description | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|---|
| **FR-RWY-001** | **Lembar Mutu summary** | Top block per fiscal year. | • Rows: Kinerja Anggaran, Ketidakpatuhan, Kecurangan; columns TW I–IV<br>• Each cell: predicate for Lini 1 and for each Lini 3 position, computed per FR-LBR-004<br>• Figures follow VIS-7: each predicate comes from an internal average (never displayed) that uses only risks whose result for that assessor has opened; a cell with none shows "Menunggu" | BR-011 | High |
| **FR-RWY-002** | **Risk × quarter matrix** | | • Rows: risks grouped by stage › risk type, including inactive ones (dimmed, "Nonaktif sejak TW [n]")<br>• Columns: TW I–IV of the selected fiscal year<br>• Cell states: one predicate chip for L1 and one per expected Lini 3 position (the count follows the quarter's set) + ✓/✕; per Lini 3 chip "Menunggu" (result not open) or "Tidak dinilai [Direktorat]"; "Belum relevan"; "Tidak dinilai Lini 1"; "Menunggu" (comparison not open — Lini 3 hidden per VIS-1); "—" (risk not active that quarter)<br>• Recurring risks carry a red left border | BR-011 | High |
| **FR-RWY-003** | **Cell detail** | Click a cell. | • 420 px right slide-over (expanding card below 900 px)<br>• Statements, predicates, Lini 3 notes, explanation and plan when present, lateness markers<br>• Link "Lihat utas TW [n]" → thread filtered to that quarter | BR-011 | High |
| **FR-RWY-004** | **Across years** | | • Fiscal year selector; default current<br>• Risks with a `lineage_id` present in other years show "Ada riwayat di TA [tahun]" and a toggle "Tampilkan lintas tahun" that extends the columns across all years for that lineage | BR-011 | Medium |
| **FR-RWY-005** | **Scope** | | • Follows the view-register scope (§1.5); Lini 2 sees assigned positions; Lini 3 all | BR-011 | High |
| **FR-RWY-006** | **Filters** | | • Stage, risk type, "Hanya Tidak Sesuai", "Hanya Berulang" | BR-011 | Medium |

### 8.3 Wireframe

> **Wireframe: Risk History (`/jabatan/:jid/riwayat`)**
>
> **Layout**
> - Workspace header and tabs; content max 1200 px
> - Below 900 px: the matrix becomes one card per risk with quarters stacked
>
> **Components**
> - Fiscal year selector, filters, "Cetak Lembar Mutu" link (→ LBR)
> - Lembar Mutu block; risk matrix; legend of chips and markers
>
> **Behavior**
> - Click cell → slide-over per FR-RWY-003
> - "Tampilkan lintas tahun" on a row expands columns for that lineage only

### 8.4 Dependencies

- Depends on: REG, NIL
- Prerequisite for: BRD

---

# 9. MODULE: COMMUNICATION SHEETS & PRINT

The Lembar Komunikasi Tiga Lini and the Lembar Mutu are **derived** from threads and assessments; nobody types them (BR-016). There is no sign-off step in the application; signatures happen on paper. Because the live view keeps changing, **every printout is a numbered, immutable snapshot**, so a signed paper can always be matched to exactly what the system printed.

### 9.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-LBR-001** | As any reader, I want the quarter's Lembar Komunikasi for a position, built from what was actually written. | |
| **US-LBR-002** | As Lini 1, I want to choose which photos go on the printout. | Maximum 5 per section |
| **US-LBR-003** | As any reader, I want to print the Lembar Mutu for signature and attachment. | |
| **US-LBR-004** | As an auditor, I want the printout to state its own standing. | Kepka 47 pending |
| **US-LBR-005** | As an auditor, I want to check a signed paper against the system by its number. | Snapshots |

### 9.2 Functional Requirements

| Code | Feature | Description | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|---|
| **FR-LBR-001** | **Section A — Lini 1** | | • Identity block from Data Umum (name, position, work unit, quarter)<br>• "Langkah" comments of the quarter, per risk, chronological, with author and date<br>• Lini 1 assessment per risk — statement, predicate, or "Belum relevan" with reason — **only for risks whose comparison has opened**; otherwise "Menunggu perbandingan" (VIS-7)<br>• Explanations and follow-up plans sent for this quarter<br>• Risks with the quiet marker listed as "Tidak ada langkah tercatat" | BR-010, BR-016 | High |
| **FR-LBR-002** | **Section B — Lini 2** | | • Lini 2 comments of the quarter, per risk, chronological, with author, position, and date<br>• "Tidak ada masukan Lini 2 pada triwulan ini" when empty | BR-010, BR-016 | High |
| **FR-LBR-003** | **Section C — Lini 3** | | • Lini 3 comments of the quarter, per risk<br>• Per Lini 3 position: statement, predicate, note per risk; comparison result<br>• Shown only for risks whose comparison has opened for that position; otherwise "Menunggu" | BR-010 | High |
| **FR-LBR-004** | **Lembar Mutu** | | • For each risk type and each assessor (Lini 1, each Lini 3 position): the **predicate** of the average score of risks whose result for that assessor has opened (VIS-7), rounded to one decimal before banding; the average itself is neither shown nor printed<br>• Excluded from the average: "Belum relevan", "Tidak dinilai", risks not assessed in that quarter (RB-REG-006)<br>• Listed separately as findings: count and list of "Tidak dinilai Lini 1"<br>• Counts: Sesuai, Tidak Sesuai, Berulang | BR-010, BR-011 | High |
| **FR-LBR-005** | **Attachment selection for print** | | • Per section, a picker of image attachments from that section's comments of the quarter; maximum 5<br>• Default: the 5 most recent images<br>• Selection saved per position per quarter per section; any participant of that line may change it<br>• Confidential attachments are never offered; the printout states "[n] lampiran konfidensial tidak dicetak"<br>• Non-image, non-confidential attachments are listed by filename only; confidential ones only as a count | BR-010, BR-017 | Medium |
| **FR-LBR-006** | **Print** | Browser print with a dedicated stylesheet; every print creates a snapshot. | • "Cetak" button; options: Lembar Komunikasi, Lembar Mutu, both<br>• Printing from the live view first creates a `PrintSnapshot` (`trigger = print`) from the viewer-neutral view (VIS-7) and prints **from the snapshot**<br>• Printing a frozen version prints that version as is; no new snapshot<br>• Header: work unit, position, quarter, fiscal year, print date, **snapshot number and version**<br>• Hidden: sidebar, topbar, buttons, filters<br>• A snapshot taken before the quarter's first automatic version is provisional: "SEMENTARA" watermark | BR-010 | Medium |
| **FR-LBR-007** | **Signature block** | | • Four columns: Pejabat Lini 1 (name from the holding at print time), Penanggung Jawab Pemantauan (Lini 2), Direktorat Kepatuhan, Direktorat Pengawasan dan Audit Internal<br>• Each: title, blank space, name line | BR-010 | Medium |
| **FR-LBR-008** | **Document status note** | | • Footer: "Nomor cetak [nomor] · Versi [n]. Dicetak dari SIMARIO pada [tanggal]. Format keluaran resmi menyusul setelah Kepka 47 ditetapkan." | BR-010 | Medium |
| **FR-LBR-009** | **Automatic freezing and versions** | Each position's quarter sheets are frozen automatically. | • **Version 1** is created (`trigger = auto_freeze`) when, for that position and quarter, every risk's comparison has opened at least partially **and** every explanation obligation existing at that time has been sent or passed its deadline + tolerance<br>• Afterwards, whenever a late Lini 3 result opens or a late explanation is sent, a **new version** is created when the resulting obligation closes by the same rule; the previous version gets `superseded_by_id` and shows "Digantikan oleh Versi [n]"<br>• At fiscal-year archiving a final version is created for every quarter whose content changed since its last version (`trigger = archive`)<br>• Automatic versions are not provisional | BR-010, BR-007 | Medium |
| **FR-LBR-010** | **Version list and lookup** | | • Snapshots are viewer-neutral (VIS-7) and are therefore withheld from a Lini 3 position for risks whose own result has not opened: such a viewer sees the snapshot with those risks masked "Menunggu", and every total that includes a masked risk (Lembar Mutu predicates, from internal averages; Sesuai/Tidak Sesuai/Berulang counts) is recomputed for that viewer without the masked risks; a risk type left with no unmasked risk shows "Menunggu". Snapshot payloads therefore store per-risk values, not only totals. Printing by such a viewer prints this masked rendering with the note "Sebagian isi disamarkan untuk pembaca ini" (VIS-9)<br>• The sheet page lists every snapshot for the position and quarter: number, version, trigger, created by, date, superseded flag<br>• Opening a snapshot renders it read-only exactly as stored, with "Ini salinan beku. Lihat tampilan berjalan."<br>• A search field on the page accepts a snapshot number, so a signed paper can be checked against the system | BR-010 | Medium |

### 9.3 Wireframe

> **Wireframe: Sheets (`/jabatan/:jid/lembar/:ta/:tw`)**
>
> **Layout**
> - Workspace header and tabs; content max 1000 px, print-like
>
> **Components**
> - Quarter selector; tabs "Lembar Komunikasi" and "Lembar Mutu"
> - Lembar Komunikasi: identity block; Sections A, B, C per FR-LBR-001–003; per-section "Pilih foto untuk dicetak"
> - Lembar Mutu: table per FR-LBR-004 and findings list
> - "Cetak" button with options
> - "Versi" panel: snapshot list and number search; badge "Tampilan berjalan" on the live view
>
> **Behavior**
> - The live view updates as threads and assessments change until archive; snapshots never change
> - Selecting a snapshot switches the page to that frozen copy
> - Photo picker opens a grid; selecting a sixth is refused with "Maksimal 5 foto per bagian"

### 9.4 Dependencies

- Depends on: PPN, NIL, REG

---

# 10. MODULE: MASTER DATA

### 10.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-MST-001** | As a reference data manager, I want stages per risk owner type. | Deck: KPA 5, PPK 5, Pokja 3, Pejabat Pengadaan 1 |
| **US-MST-002** | As a reference data manager, I want templates per risk owner type, stage, and risk type. | |
| **US-MST-003** | As a reference data manager, I want to know how many positions use a template before editing it. | |
| **US-MST-004** | As a reference data manager, I want to promote good custom risks to templates. | Proposal queue |
| **US-MST-005** | As a reference data manager, I want to define the Data Umum form per risk owner type. | |
| **US-MST-006** | As a reference data manager, I want to maintain the score bands, versioned. | |
| **US-MST-007** | As a reference data manager, I want to manage position types and positions on all lines. | |
| **US-MST-008** | As a reference data manager, I want the final seed data from the Rapim deck loaded at installation. | OQ-6 closed |

### 10.2 Functional Requirements

| Code | Feature | Description | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|---|
| **FR-MST-001** | **Stages** | Stages belong to a risk owner type. | • Accordion per Lini 1 position type; rows: order, name (inline edit), active toggle, template count<br>• Drag to reorder; "Tambah Tahap"<br>• Seed from the deck: **KPA/Kasatker** — Perencanaan · Penganggaran · Pelaksanaan Anggaran · Pelaporan · Pertanggungjawaban Anggaran; **PPK** — Perencanaan Pengadaan · Pengadaan di Bawah Rp50 Juta (Pembelian Langsung/Kuitansi) · Pengadaan Barang/Jasa Lainnya di Atas Rp200 Juta (E-Katalog) · Pelaksanaan/Pengendalian Kontrak · Serah Terima Hasil Pekerjaan; **Pokja Pemilihan** — Persiapan Pemilihan · Pemilihan Penyedia · Penetapan Pemenang; **Pejabat Pengadaan** — Pengadaan Antara Rp50 Juta s.d. Rp200 Juta<br>• A stage used by any register cannot be deleted, only deactivated; inactive stages disappear from new registers only | BR-001, BR-008 | High |
| **FR-MST-002** | **Template tree** | 280 px left panel. | • Level 1: risk owner type · Level 2: stage · Level 3: risk type<br>• Count badges per node | BR-002 | High |
| **FR-MST-003** | **Template list and edit** | | • Rows: wording, mitigation count, "Dipakai [N] jabatan" badge for the current year, active toggle<br>• Edit in a 420 px slide-over: wording; mitigation list, add/remove/reorder<br>• **No score fields** (impact/likelihood disabled, §1.10)<br>• Usage warning: "Template ini dipakai [N] jabatan pada TA berjalan. Perubahan tidak memengaruhi register yang sudah ada." | BR-002 | High |
| **FR-MST-004** | **Template deactivation** | | • Inactive templates disappear from new selection and from copy-forward suggestions; existing registers keep their snapshot<br>• Permanent delete only for never-used templates | BR-002, BR-007 | High |
| **FR-MST-005** | **Proposal queue** | `/master/usulan` | • Rows: wording, risk owner type, stage, risk type, proposer, position, date<br>• "Jadikan Template" opens the template editor prefilled; "Tolak" requires a reason<br>• Accepting never alters existing registers | BR-002 | Medium |
| **FR-MST-006** | **Data Umum forms** | `/master/data-umum` | • One form per Lini 1 position type, versioned<br>• Fixed fields (Tujuan, Kegiatan, Besar Anggaran, Target) always present; the default objective text is editable (seed: "Memastikan pelaksanaan anggaran dilaksanakan secara taat azas dan risiko signifikan teridentifikasi.")<br>• Additional fields: label, kind (text, number, currency, date, list), mandatory<br>• The identity block is not configured here; it comes from position and holding fields | BR-001, BR-008 | Medium |
| **FR-MST-007** | **Score bands** | `/master/skala-penilaian` | • Versioned; exactly one active (INV-3)<br>• Table: predicate, lower bound (exclusive), upper bound (inclusive); seed per §2.8.1<br>• Saving is refused if bands leave a gap or overlap in 0.0–4.0<br>• "Buat Versi Baru" with an effective-from date; a new version applies from the first quarter whose first window opens on or after that date — a quarter already open keeps its version; banner "Perubahan rentang tidak mengubah predikat yang sudah tersimpan."<br>• A guidance text field per predicate, shown as help on the assessment page (OQ-1)<br>• "Pilihan penilaian" per version: statement + value; ≥1 statement per predicate, unique values and statements; saving refused otherwise<br>• Active version: statement text editable in place (audited); adding, removing or revaluing statements requires "Buat Versi Baru"<br>• The 0–4 preview marks each statement's value | BR-008 | High |
| **FR-MST-008** | **Position types** | | • As v2.1: name, line, default role, multiple Pejabat, has templates, built-in, active; identity fields per type<br>• Built-ins: KPA/Kasatker, PPK, Pokja Pemilihan, Pejabat Pengadaan (Lini 1); Penanggung Jawab Pemantauan, Unit Pendukung Pemantauan (Lini 2); Penjamin Mutu (Lini 3) | BR-008 | High |
| **FR-MST-009** | **Positions** | | • As v2.1: code, name, work unit, type, line, current Pejabat, active; identity fields per type<br>• Lini 3 seed: "Direktorat Kepatuhan", "Direktorat Pengawasan dan Audit Internal" | BR-009 | High |
| **FR-MST-010** | **Seed data** | Stages, templates, and Data Umum forms from the Rapim deck | • Loaded at installation as final reference data (OQ-6 closed); no verification step<br>• Known deck defects are corrected during seeding and listed in a seed note (e.g. mitigations labelled "Risiko 6.a", overlapping risk type headings in the KPA Pertanggungjawaban slide, the Pejabat Pengadaan identity block reusing "Nomor DIPA Petikan")<br>• Score band guidance text seeded from the deck's scoring guidance (OQ-1 closed)<br>• Score options seeded from `docs/seed/pilihan_penilaian.json` (illustrative draft, to be replaced via `/master/skala-penilaian`) | BR-002 | High |

### 10.3 Wireframes

> **Wireframe: Templates (`/master/template`)**
>
> **Layout**
> - Sidebar 240 px; tree 280 px; list fills the rest; edit in a 420 px slide-over; tree becomes cascading dropdowns below 900 px
>
> **Components**
> - Tree with counts; search; template rows; "Tambah Template"; unverified counter
>
> **Behavior**
> - Clicking a node loads the list without reload

> **Wireframe: Stages (`/master/tahap`)**
>
> **Layout**
> - Sidebar 240 px; single column at full content width; accordion per risk owner type
>
> **Components**
> - Stage rows with drag handle, name, template count, active toggle; "Tambah Tahap"
>
> **Behavior**
> - Pencil → inline rename; Enter saves; drag saves order immediately

> **Wireframe: Data Umum forms (`/master/data-umum`)**
>
> **Layout**
> - Sidebar 240 px; type selector left, form builder right
>
> **Components**
> - Fixed fields (locked), default objective textarea, additional field list with "Tambah Isian", version label
>
> **Behavior**
> - Saving creates a new version; registers keep the version they started with

> **Wireframe: Score bands (`/master/skala-penilaian`)**
>
> **Layout**
> - Sidebar 240 px; single column at full content width
>
> **Components**
> - Version selector, effective date, "Buat Versi Baru"; band table; guidance text per predicate; a 0–4 bar previewing the bands in colour with text labels; "Pilihan penilaian" table (Kalimat, Nilai, Predikat)
>
> **Behavior**
> - Gaps or overlaps are highlighted red and block saving

> **Wireframe: Position types and positions (`/master/jabatan`)**
>
> **Layout**
> - Sidebar 240 px; two stacked sections
>
> **Components**
> - Position types grouped by line; position table with filters; "Tambah Jenis", "Tambah Jabatan"
>
> **Behavior**
> - Choosing a type in the position form renders that type's identity fields

> **Wireframe: Proposal queue (`/master/usulan`)**
>
> **Layout**
> - Sidebar 240 px; full-width table
>
> **Components**
> - Table per FR-MST-005; "Jadikan Template", "Tolak"
>
> **Behavior**
> - "Jadikan Template" opens the template slide-over prefilled

### 10.4 Module Business Rules

| Code | Rule | Consequence |
|---|---|---|
| RB-MST-001 | Template changes are never retroactive | Snapshots stay |
| RB-MST-002 | Score bands are versioned; predicates are stored at finalise | Past predicates never change |
| RB-MST-003 | Stages and templates belong to the risk owner type, not the position | All PPKs share them |
| RB-MST-004 | A stage with no templates still appears in the register, with custom risks and declarations available | A new stage is usable before templates exist |

### 10.5 Dependencies

- Prerequisite for: REG, NIL, LBR

---

# 11. MODULE: NOTIFICATIONS

In-app only. Every notification links to the exact context (position, fiscal year, quarter, thread, comment).

### 11.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-NTF-001** | As a Pejabat, I want to know when my Operator has something ready for me. | |
| **US-NTF-002** | As Lini 2, I want to know when a position I coordinate publishes risks. | |
| **US-NTF-003** | As a participant, I want to know when I am mentioned or a thread I follow moves. | Without being flooded |
| **US-NTF-004** | As Lini 1 and Lini 3, I want reminders before my deadline. | |
| **US-NTF-005** | As a participant, I want to know when a comparison opens, and Lini 1 when it must explain. | |
| **US-NTF-006** | As Lini 2 and Lini 3, I want to know when an explanation arrives. | |

### 11.2 Functional Requirements

| Code | Event | Recipients | Text | Ref | Prio |
|---|---|---|---|---|---|
| **FR-NTF-001** | Operator marks register, additions, assessment, or explanation "Siap" | Pejabat (Pokja: Pengisi) | "[Nama Operator] menandai [objek] [Jabatan] siap untuk Anda tuntaskan" | BR-015 | High |
| **FR-NTF-002** | Register or additions published | Holders of the assigned Lini 2 lead and support positions | "[Jabatan] menerbitkan [n] risiko TA [tahun]" | BR-016 | Medium |
| **FR-NTF-003** | Mention | The mentioned user | "[Nama] menyebut Anda di utas '[uraian risiko]'" | BR-016 | High |
| **FR-NTF-004** | New comment on a followed thread | Subscribers except the author and muted users | Aggregated per thread while unread: "[n] komentar baru di '[uraian risiko]'"; the line chip of the latest author shown | BR-016 | Medium |
| **FR-NTF-005** | Lini 1 window opens (`lini1_opens_on`); H-7 and H-1 before `lini1_deadline` while unfinalised risks remain | Lini 1 Pejabat and Operators of each position | "Penilaian TW [n] [Jabatan]: tenggat [tanggal], [x] dari [y] risiko sudah dinilai" | BR-004, BR-012 | High |
| **FR-NTF-006** | Lini 3 window opens (`lini3_opens_on`); H-7 and H-1 before `lini3_deadline` while unfinalised risks remain | Lini 3 Pejabat and Operators | "Penilaian Lini 3 TW [n]: [x] dari [y] risiko sudah dinilai" | BR-005 | High |
| **FR-NTF-007** | Comparison opens (fully or partially) for a position | Lini 1 holders, Lini 2 assigned **for that quarter**, holders of the quarter's expected Lini 3 positions | Each recipient's counts follow VIS-9 (a still-blind Lini 3 position is not notified about that risk): "Perbandingan TW [n] [Jabatan] dibuka: [s] Sesuai, [t] Tidak Sesuai" | BR-005 | High |
| **FR-NTF-008** | Recurring detected | Lini 1 holders, Lini 2 lead holders assigned for that quarter, Lini 3 holders whose own result for that risk has opened (VIS-9) | "Risiko '[uraian]' dinilai Kurang Terkendali oleh Lini 3 dua triwulan berturut-turut" | BR-006 | High |
| **FR-NTF-009** | Mandatory explanation created; H-1 before its deadline when not sent | Lini 1 Pejabat and Operators | "[n] risiko memerlukan penjelasan paling lambat [tanggal]" | BR-018 | High |
| **FR-NTF-010** | Explanation sent | Lini 2 assigned for the result's quarter, holders of the quarter's expected Lini 3 positions whose own result for that risk has opened (VIS-9) | "[Jabatan] mengirim penjelasan untuk '[uraian risiko]'" | BR-018 | Medium |
| **FR-NTF-011** | Appointed or revoked as Operator | The Operator | "Anda ditunjuk sebagai operator untuk [Jabatan] oleh [Nama Pejabat]" / "Penunjukan Anda sebagai operator untuk [Jabatan] berakhir" | BR-015 | High |
| **FR-NTF-012** | 14 days before projected archive | Lini 1 holders | "Utas TA [tahun] akan diarsipkan sekitar [tanggal]" | BR-007 | Low |

Rules common to all: idempotent (the same event never notifies twice); reminders never repeat daily; each notification's link opens the precise target.

| Code | Feature | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|
| **FR-NTF-013** | **Notification panel** | • From the topbar bell; 380 px dropdown, max 480 px tall<br>• Unread badge count; unread rows tinted with a dot<br>• Click marks read and navigates<br>• "Tandai semua sudah dibaca"; 20 most recent; "Lihat semua" | BR-011 | Medium |
| **FR-NTF-014** | **All notifications page** | • `/notifikasi`; 25 per page; filter by kind and read state | BR-011 | Medium |

### 11.3 Wireframes

> **Wireframe: Notification panel (overlay, no route)**
>
> **Layout**
> - 380 px dropdown beneath the bell, scrolling
>
> **Components**
> - Header "Notifikasi" and "Tandai semua sudah dibaca"; rows with kind dot, text, relative time; footer "Lihat semua"; empty state "Belum ada pemberitahuan"
>
> **Behavior**
> - Click a row → read, close, navigate

> **Wireframe: All notifications (`/notifikasi`)**
>
> **Layout**
> - Sidebar 240 px; single column at full content width
>
> **Components**
> - Filter pills; rows with absolute timestamps; pagination
>
> **Behavior**
> - Filters combine with AND

### 11.4 Dependencies

- Depends on: REG, PPN, NIL, ADM

---

# 12. MODULE: ADMINISTRATION

Four easily-confused things kept apart: **roles** hold permissions; **users** hold attributes of the person; **holdings** put a person on a position as Pejabat or Operator; **monitoring assignments** connect Lini 1 positions to a Lini 2 team. Plus the calendar, metrics, and audit trail.

### 12.1 User Stories

| ID | User Story | Note |
|---|---|---|
| **US-ADM-001** | As a superadmin, I want to create roles and tick their permissions. | |
| **US-ADM-002** | As a superadmin, I want to give a person a manual role such as Pengelola Master Data. | Line roles follow holdings |
| **US-ADM-003** | As a superadmin, I want to record which Lini 2 positions coordinate with which Lini 1 positions, for which quarters. | |
| **US-ADM-004** | As a superadmin, I want to appoint a Pejabat to a position with their decree. | |
| **US-ADM-005** | As a superadmin, I want to replace a Pejabat mid-year without anything moving. | Alih Pejabat |
| **US-ADM-006** | As a superadmin, I want to create a fiscal year and set each quarter's deadlines. | |
| **US-ADM-007** | As internal audit, I want to trace every change, who made it, and for which position. | |
| **US-ADM-008** | As a superadmin, I want to see whether the product meets its objectives. | |
| **US-ADM-009** | As a Pejabat, I want to appoint staff as Operators with a delegation letter. | Optional |
| **US-ADM-010** | As a Pejabat, I want to revoke an Operator at any time. | |
| **US-ADM-011** | As a user, I want one page listing every position I hold and in what capacity. | |

### 12.2 Functional Requirements

| Code | Feature | Description | Acceptance Criteria | Ref | Prio |
|---|---|---|---|---|---|
| **FR-ADM-001** | **Role list** | | • Rows with initials, name, delete when selected<br>• Superadmin locked ("Terkunci"), no delete<br>• "Tambah Peran"<br>• A role held by users, or named as a position type's default role, cannot be deleted; the message names the count or the types | BR-008 | High |
| **FR-ADM-002** | **Permission table** | Grouped checklist for the selected role. | • **Lini 1:** 1 view register and board (Own/Unit/All); 2 draft register (own only); 3 publish and deactivate register items (own only, **Pejabat**); 4 draft Lini 1 assessment and explanation (own only); 5 finalise Lini 1 assessment and send explanation (own only, **Pejabat**)<br>• **Board:** 6 participate in threads (own only — participation per §1.5); 7 download attachments (Own/Unit/All)<br>• **Lini 3:** 8 draft Lini 3 assessment (scoped, default All); 9 finalise Lini 3 assessment (scoped, default All, **Pejabat**); 10 view confidential attachments (scoped, default All; **can only be ticked on Superadmin and on roles that are the default role of a Lini 3 position type**, BR-017)<br>• **Delegation:** 11 manage own Operators (own only, **Pejabat**)<br>• **Master data:** 12 templates; 13 proposal queue; 14 score bands; 15 stages; 16 Data Umum forms; 17 position types; 18 positions — unscoped<br>• **Administration:** 19 fiscal years and quarters; 20 monitoring assignments; 21 users and Pejabat holdings; 22 roles and access — unscoped<br>• **Audit:** 23 view audit trail (Own/Unit/All)<br>• **Oversight:** 24 view assessments before their result opens (FR-NIL-012); 25 remove a confidential mark; 26 archive a fiscal year manually — all unscoped<br>• Drafting actions 2, 4, 8 carry `is_drafting = true` (INV-24)<br>• Content actions (2–6, 8, 9, 11) require a holding on the **acting** position (INV-25): Lini 1 actions are performed from a held Lini 1 position; Lini 2 participation and Lini 3 assessment are performed from a held Lini 2 or Lini 3 position **on** Lini 1 positions linked by assignment (§1.5) or by the line rule. Downloading (7) and viewing (1, 10, 23) are not content actions and follow scope only<br>• "Hanya Pejabat" badge and `requires_official = true` on 3, 5, 9, 11 (INV-12)<br>• Printing is not a permission; it follows permission 1<br>• Superadmin read-only | BR-008, BR-015, BR-017 | High |
| **FR-ADM-003** | **Default roles** | Five roles ship as a starting point. | • Pemilik Risiko: 1 (Own), 2, 3, 4, 5, 6, 7 (Own), 11 — default role of every Lini 1 type<br>• Pemantau: 1 (Own), 6, 7 (Own), 11 — default role of both Lini 2 types<br>• Penjamin Mutu: 1 (All), 6, 7 (All), 8, 9, 10 (All), 11, 23 (All) — default role of the Lini 3 type<br>• Pengelola Master Data: 12–18 — manual<br>• Superadmin: all 26 — manual, locked; content actions still require a holding (INV-25), so by default Superadmin configures and oversees only<br>• Operators receive their Pejabat's role through the holding; 3, 5, 9, 11 stay closed to them | BR-008, BR-015 | High |
| **FR-ADM-004** | **User settings** | Accounts, roles, Pejabat holdings. | • Columns: Name, NIP, Email, Work Unit, Jabatan (as Pejabat), Operator untuk (count), Roles (manual + automatic, automatic read-only with source), Account type, Created via, Status<br>• "Tetapkan Jabatan": position, decree number, date, file, start date; Pokja: several members, "Pengisi" toggle for exactly one across current and new members — ticking it on a new member moves the mark (FR-ADM-005 rules apply)<br>• If the user is an Operator of the same position, the delegation ends (`promoted`) in the same transaction (as FR-ADM-005)<br>• Appointing to an occupied single-Pejabat position is refused with a pointer to "Alih Pejabat"<br>• Deactivate, never delete; deactivation ends holdings and delegations, counts stated<br>• Deactivating the Pengisi of a Pokja that has other active members is refused until the Pengisi mark is moved; if they are the last member, the position becomes vacant<br>• Effective dates for "Tetapkan Jabatan" may not be in the future<br>• Password reset for local accounts | BR-008, BR-009 | High |
| **FR-ADM-005** | **Alih Pejabat** | Replace the Pejabat of a position. Nothing moves. | • Dialog: position, outgoing, incoming, effective date, decree number, date, file<br>• **Effective date may not be in the future; the change applies immediately on confirmation.** Every action of the outgoing Pejabat before confirmation stays valid; the effective date is recorded on both occupancies for history<br>• If the incoming user is an Operator of the same position, that delegation ends (`promoted`) in the same transaction and the account is not deactivated (RB-AUT-004)<br>• Closes the old occupancy and opens the new one atomically<br>• Operators appointed by the outgoing Pejabat end (`official_changed`); count stated<br>• Registers, threads, assessments stay on the position; drafts become the incoming Pejabat's to finalise<br>• Pokja: replace one member or move the Pengisi mark; moving the mark ends the Operators appointed by the previous Pengisi (`filler_changed`)<br>• Audit-logged | BR-009 | High |
| **FR-ADM-006** | **Monitoring assignments** | Lini 1 positions → Lini 2 team. | • Columns: Lini 1 position, Lead, Supports with domain badge (Kinerja Anggaran / PBJ), Quarters (from–to), Decree<br>• Exactly one lead per Lini 1 position per quarter (INV-14); zero or more supports<br>• Assignments name positions, not people<br>• Bulk assignment for many Lini 1 positions<br>• "Belum ditugaskan" warning card for the current quarter<br>• Lini 3 is not assigned | BR-008, BR-016 | High |
| **FR-ADM-007** | **Fiscal years and quarters** | `/pengaturan/tahun-anggaran` | • "Buat Tahun Anggaran" generates four quarters with default dates per §2.5, all editable<br>• Per quarter: starts on, ends on, **Lini 1 window opens**, Lini 1 deadline, **Lini 3 window opens**, Lini 3 deadline, explanation working days<br>• Per fiscal year: tolerance days, **archive grace days**<br>• Validation per INV-9<br>• Moving a window opening later than a date on which scores were already entered is refused with the count of affected rows<br>• Changing a deadline after it has passed asks for confirmation and never recomputes recorded lateness<br>• Status panel: open / closing / archived; projected archive date = the extended hard limit (§2.5); whether TW IV is complete, and if not what still blocks it<br>• Archiving runs automatically at the hard limit (§2.5); a user with permission 26 may archive earlier once TW IV is complete<br>• Per quarter, the expected Lini 3 set is shown after `lini3_opens_on`, with "Kecualikan" (mandatory reason) per position | BR-008, BR-012 | High |
| **FR-ADM-008** | **Audit trail** | | • Columns: Time, Actor, Acting as, Position, Action, Entity, Before, After<br>• Filters: date range, actor, position, entity type, action (including "lihat lampiran konfidensial", "lihat penilaian sebelum dibuka")<br>• Append-only (INV-6); passwords and file contents never recorded<br>• Redaction per VIS-8; a user with permission 24 can toggle "Tampilkan nilai asli", each use logged | BR-007 | High |
| **FR-ADM-009** | **Permission guards** | | • Never zero active holders of manage-roles (INV-5)<br>• A role cannot grant a permission it lacks<br>• INV-13 enforced at appointment<br>• Changes audit-logged and invalidate affected sessions | BR-007, BR-008 | High |
| **FR-ADM-010** | **Kelola Operator** | Pejabat self-service. | • From `/jabatan-saya`, one card per position held as Pejabat (Pokja: Pengisi)<br>• "Tunjuk Operator": staff search by NIP or name from Keycloak (OQ-11); letter number, date, PDF file mandatory; optional end date<br>• Creates an account with `created_via = delegation` if absent<br>• "Cabut" ends the delegation after confirmation; drafts stay<br>• Active and historical Operators listed<br>• No Operators → "Anda mengerjakan sendiri. Menunjuk operator bersifat opsional." | BR-015 | High |
| **FR-ADM-011** | **Product metrics** | `/metrik` | • Objective 1: share of risks from templates, per fiscal year<br>• Objective 2: share of risks assessed in the quarter (RB-REG-006) with ≥1 Langkah, per quarter<br>• Objective 3: share of final Lini 1 scores with ≥1 attachment, per quarter<br>• Objective 4: recurring risks detected and how many received an explanation<br>• Objective 8: median time-on-task to finalise a Lini 1 quarterly assessment<br>• Objective 9: alignment rate, per quarter and per Lini 3 position<br>• Each card names its query; "Data belum cukup" instead of a misleading zero; CSV export | BR-008 | High |
| **FR-ADM-012** | **Jabatan Saya** | `/jabatan-saya` | • As Pejabat: position, line, decree, since, Operator card (FR-ADM-010)<br>• As Operator: position, appointing Pejabat, letter, since, until | BR-015 | Medium |
| **FR-ADM-013** | **Bulk import** | `/pengaturan/impor` | • Three kinds, each needing its own permission: **Jabatan** (permission 18), **Penetapan Pejabat** (21), **Penugasan Pemantauan** (20)<br>• "Unduh Templat CSV" per kind with header and one example row. Columns:<br>  – **Jabatan:** `kode_unit`, `kode_jabatan`, `nama_jabatan`, `jenis_jabatan`, then one column `identitas.<kunci>` per identity field of that type<br>  – **Penetapan Pejabat:** `nip`, `nama_lengkap`, `email`, `kode_unit`, `kode_jabatan`, `nomor_sk`, `tanggal_sk`, `tanggal_mulai` (YYYY-MM-DD, not in the future), `pengisi` (ya/tidak; mandatory for Pokja, exactly one Pengisi per Pokja counting existing active holdings — a "ya" for a Pokja that already has a Pengisi is an error)<br>  – **Penugasan Pemantauan:** `kode_unit_lini1`, `kode_jabatan_lini1`, `kode_unit_pj`, `kode_jabatan_pj`, `pendukung` (`kodeunit/kodejabatan:domain` separated by `;`, domain `kinerja_anggaran` or `pbj`), `tw_mulai`, `tw_selesai` (format `2027-1`), `nomor_sk`<br>• Rows that would replace a current Pejabat are errors; use Alih Pejabat<br>• A row appointing an existing Operator of the same position ends that delegation (`promoted`) on commit<br>• Upload → **dry run**: every row validated against the same rules as the single-entry dialogs (INV-2, INV-4, INV-13, INV-14, known NIP, known position code, known work unit); report lists row number, column, and message<br>• "Terapkan" commits all valid rows in one transaction only when the error count is zero; otherwise nothing is written<br>• Pejabat rows may omit the decree file; such holdings carry "SK belum diunggah" until a file is added in user settings<br>• Users referenced by NIP but not yet in SIMARIO are created (`created_via = admin`)<br>• Every committed job is audit-logged with its row count; the job history is listed on the page | BR-008, BR-009 | High |

### 12.3 Wireframes

> **Wireframe: Role settings (`/pengaturan/peran`)**
>
> **Layout**
> - Sidebar 240 px; role list 320 px; permission panel fills the rest
>
> **Components**
> - Role rows; "Tambah Peran"; selected role header with the position types that use it as default; grouped permission table (Lini 1 · Papan · Lini 3 · Delegasi · Master Data · Administrasi · Audit) with Enabled and Scope columns; "Hanya Pejabat" badges
>
> **Behavior**
> - Ticking an action activates its scope selector, default Own; own-only actions show only Own; Superadmin read-only

> **Wireframe: User settings (`/pengaturan/pengguna`)**
>
> **Layout**
> - Sidebar 240 px; full-width table
>
> **Components**
> - Search, filters (work unit, line, role, status), "Tambah Pengguna"; row menu: Sunting · Tetapkan Jabatan · Alih Pejabat · Atur Ulang Kata Sandi · Nonaktifkan
>
> **Behavior**
> - Dialogs state consequences (Operators ending, holdings ending) before confirming

> **Wireframe: Monitoring assignments (`/pengaturan/penugasan-pemantauan`)**
>
> **Layout**
> - Sidebar 240 px; full-width table
>
> **Components**
> - "Belum ditugaskan" card; table; filters; "+ Tambah Penugasan"
>
> **Behavior**
> - Dialog: multi-select Lini 1 positions, one lead, supports with domain, quarter range, decree

> **Wireframe: Fiscal years (`/pengaturan/tahun-anggaran`)**
>
> **Layout**
> - Sidebar 240 px; year list left, quarter editor right
>
> **Components**
> - "Buat Tahun Anggaran"; per year: status chip, tolerance, archive grace days; four quarter rows with date pickers for both windows and both deadlines; archive panel with blockers, hard-limit date, and projected date
>
> **Behavior**
> - Invalid ordering of dates highlighted and blocks saving

> **Wireframe: My positions (`/jabatan-saya`)**
>
> **Layout**
> - Sidebar 240 px; single column at full content width
>
> **Components**
> - "Sebagai Pejabat" cards with Operator list and "Tunjuk Operator"; "Sebagai Operator" cards
>
> **Behavior**
> - "Tunjuk Operator" dialog; "Cabut" confirmation

> **Wireframe: Bulk import (`/pengaturan/impor`)**
>
> **Layout**
> - Sidebar 240 px; single column at full content width
>
> **Components**
> - Kind selector (Jabatan · Penetapan Pejabat · Penugasan Pemantauan); "Unduh Templat CSV"; upload area
> - Dry-run result: counts (rows, valid, errors), error table (row, column, message), "Terapkan" button
> - Job history table
>
> **Behavior**
> - "Terapkan" is active only when errors = 0; pressing it with errors is impossible because the button explains "Perbaiki [n] baris bermasalah terlebih dahulu"
> - Re-uploading replaces the dry run

> **Wireframe: Product metrics (`/metrik`)**
>
> **Layout**
> - Sidebar 240 px; single column max 1200 px
>
> **Components**
> - Fiscal year selector, "Unduh CSV", one card per objective with value, target, trend, query note
>
> **Behavior**
> - Changing the year reloads all cards

> **Wireframe: Audit trail (`/jejak-audit`)**
>
> **Layout**
> - Sidebar 240 px; full-width table
>
> **Components**
> - Filters per FR-ADM-008; rows expandable to show before/after JSON
>
> **Behavior**
> - No edit or delete controls exist

### 12.4 Module Business Rules

| Code | Rule | Consequence |
|---|---|---|
| RB-ADM-001 | Permissions determine capability; holdings and assignments determine the object | Every check: permission → holding/assignment/line rule → Pejabat for finalising |
| RB-ADM-002 | Role names never appear in application logic | |
| RB-ADM-003 | Registers belong to a Lini 1 position | Unique per (position, fiscal year) |
| RB-ADM-004 | Alih Pejabat changes who holds a position; nothing moves | |
| RB-ADM-005 | Deadlines mark, never lock | Except the comparison freeze (RB-NIL-005) |
| RB-ADM-006 | Only the Pejabat finalises (INV-12) | |
| RB-ADM-007 | Delegation is optional and personal to the appointing Pejabat | Ends with that Pejabat's holding |
| RB-ADM-008 | Delegation requires a letter | Number, date, file mandatory |

### 12.5 Dependencies

- Prerequisite for: every module

---

# APPENDICES

## A. Role × Feature Matrix

Default configuration. Operators carry their Pejabat's role; rows marked **P** stay closed to them.

| Feature | PMR | PMT | PJM | PMD | SAD |
|---|:---:|:---:|:---:|:---:|:---:|
| View register, board, history, sheets | ✓ Own | ✓ Own | ✓ All | — | ✓ All |
| Draft register | ✓ F | — | — | — | — |
| Publish / deactivate register items | ✓ P | — | — | — | — |
| Participate in threads (comment, attach, mention) | ✓ | ✓ | ✓ | — | — |
| Mark comment as Langkah | ✓ | — | — | — | — |
| Mark attachment confidential (own uploads) | — | — | ✓ | — | — |
| Remove a confidential mark | — | — | — | — | ✓ |
| View confidential attachments | — | — | ✓ All | — | ✓ All |
| Draft Lini 1 assessment and explanation | ✓ F | — | — | — | — |
| Finalise Lini 1 assessment, send explanation | ✓ P | — | — | — | — |
| Draft Lini 3 assessment | — | — | ✓ | — | — |
| Finalise Lini 3 assessment | — | — | ✓ P | — | — |
| Download attachments | ✓ Own | ✓ Own | ✓ All | — | ✓ All |
| Manage own Operators | ✓ P | ✓ P | ✓ P | — | — |
| View assessments before their result opens (logged) | — | — | — | — | ✓ |
| Archive a fiscal year manually | — | — | — | — | ✓ |
| Master data (stages, templates, proposals, Data Umum, score bands, position types, positions) | — | — | — | ✓ | ✓ |
| Fiscal years, monitoring assignments, users and holdings, roles | — | — | — | — | ✓ |
| View audit trail | — | — | ✓ All | — | ✓ All |
| Product metrics | — | — | — | — | ✓ |

Key: ✓ = access · — = none · scope after the tick · **P** = only on positions the user holds as Pejabat (Pokja: Pengisi), never for an Operator (INV-12) · **F** = on Pokja positions only the Pengisi or an Operator (INV-24). Every content action also requires a holding on the position (INV-25); Superadmin holds every permission but, without a holding, configures and oversees only. Participation also requires the relationship in §1.5.

## B. Traceability Matrix

| BR | US | FR | Modules |
|---|---|---|---|
| BR-001 | US-REG-001 to 008 | FR-REG-001 to 013, FR-BRD-003, FR-MST-001, 006 | REG, BRD, MST |
| BR-002 | US-REG-001, 003, US-MST-002 to 004, 008 | FR-REG-003, 004, FR-MST-002 to 005, 010 | REG, MST |
| BR-003 | — (deferred) | — | — |
| BR-004 | US-NIL-001 to 003, US-BRD-001 | FR-NIL-001 to 004, FR-BRD-001, FR-NTF-005, 006 | NIL, BRD, NTF |
| BR-005 | US-NIL-004 to 007, US-BRD-005, US-NTF-004 to 006 | FR-NIL-005 to 007, 009, 010, FR-BRD-006, 007, FR-NTF-006, 007 | NIL, BRD, NTF |
| BR-006 | US-BRD-005 | FR-NIL-011, FR-NTF-008, FR-BRD-007 | NIL, NTF, BRD |
| BR-007 | US-ADM-007, US-PPN-007, US-LBR-005 | FR-PPN-008, 012, FR-REG-010, 011, 013, FR-NIL-012, FR-ADM-008, 009, FR-NTF-012 | PPN, REG, NIL, ADM |
| BR-008 | US-AUT-001 to 004, US-ADM-001, 002, 006, US-MST-005 to 007 | FR-AUT-001 to 005, 007, FR-BRD-008, 010, FR-MST-001, 006 to 008, FR-ADM-001 to 004, 007, 011, 013 | AUT, MST, ADM |
| BR-009 | US-ADM-004, 005 | FR-AUT-006, FR-ADM-004, 005, FR-MST-009 | AUT, ADM, MST |
| BR-010 | US-LBR-001 to 005 | FR-LBR-001 to 010 | LBR |
| BR-011 | US-RWY-001 to 004, US-BRD-003 | FR-RWY-001 to 006, FR-BRD-004, FR-REG-009 | RWY, BRD, REG |
| BR-012 | US-BRD-001, 002, US-NTF-004 | FR-BRD-001, 002, FR-PPN-009, FR-NIL-003, 009, FR-ADM-007, FR-NTF-005 | BRD, PPN, NIL, ADM, NTF |
| BR-013 | US-REG-004, US-NIL-002 | FR-REG-005, 007, FR-NIL-003 | REG, NIL |
| BR-014 | US-PPN-002 | FR-PPN-005, NFR-009 to NFR-013 | PPN |
| BR-015 | US-AUT-005, US-REG-005, 006, US-NIL-003, US-ADM-009 to 011 | FR-AUT-009, FR-REG-006, 007, FR-NIL-003, 006, FR-ADM-002, 003, 010, 012, FR-NTF-001, 011 · US-NTF-001 | AUT, REG, NIL, ADM, NTF |
| BR-016 | US-PPN-001 to 008, US-BRD-004, 007 | FR-PPN-001 to 011, FR-BRD-005, 009, 011, FR-LBR-001, 002, FR-NTF-002 to 004, 013, 014 · US-NTF-002, 003 | PPN, BRD, LBR, NTF |
| BR-017 | US-PPN-004, US-NIL-005 | FR-PPN-006, FR-NIL-005, FR-LBR-005, §2.7 | PPN, NIL, LBR |
| BR-018 | US-NIL-008, 009 | FR-NIL-008, FR-NTF-009, 010 | NIL, NTF |

## C. External System Integration

| System | Integration type | Data exchanged | Plan |
|---|---|---|---|
| Keycloak (OIKN SSO) | Authentication; staff lookup for delegation (OQ-11) | Identity matched on NIP | **v1.0** |
| SAKTI | To be determined | Budget ceilings and realisation | v1.2 |
| SIRUP / Inaproc | To be determined | Procurement package data | v1.2 |

## D. Roadmap

**v1.0 — this document.**

**v1.1 — three months after release**
- Programmatic PDF export following Kepka 47
- Leadership role and dashboard aggregating across positions
- Impact × likelihood scoring and risk level mapping, if criteria settle
- National holiday calendar for working-day deadlines

**v1.2 — six months after release**
- Email and instant-messaging notifications
- Spreadsheet import of a register
- SAKTI and SIRUP integration
- Residual risk assessment

## E. Suggested Build Order

1. **Foundation** — Keycloak OIDC and local fallback, users, positions, holdings and delegation, dynamic roles and permissions, fiscal years and quarters with windows, bulk import, audit trail with its append-only trigger
2. **Master data** — position types, positions, stages, templates, Data Umum forms, score bands; load the final seed data from the Rapim deck
3. **Risk Register** — Data Umum, stage sections, publish, mid-year additions, copy from previous year
4. **Risk Board** — threads, mitigation sub-threads, comments, Langkah, attachments with scanning, mentions, subscriptions, quiet marker
5. **Quarterly Assessment** — Lini 1 entry and finalise, Lini 3 blind entry, comparison opening task, explanation, recurring detection
6. **Risk History, Notifications, Home**
7. **Sheets & Print, Metrics**

> **Pause after step 4** and run one live month with one or two positions and their Lini 2 and Lini 3 counterparts before building assessment. The board is the part most likely to be used differently than designed — whether Lini 1 writes Langkah at all, whether Lini 2 participates, how many attachments a thread collects.

The blind-assessment rule (INV-16) and the confidentiality rule (INV-17) are enforced in the API layer and must have dedicated tests before step 5 is considered done.

## F. Revision History

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0 | 31-08-2026 | Initial version | Direktorat Data dan Kecerdasan Buatan |
| 2.0 | 02-09-2026 | English rewrite; flags instead of hard gates; data model; SSO in v1.0; attachment security; metrics | Direktorat Data dan Kecerdasan Buatan |
| 2.1 | 10-10-2026 | Accounts and roles: positions on three lines, Pejabat and Operator, roles following holdings, Lini 2 team assignment, Lini 3 unassigned | Direktorat Data dan Kecerdasan Buatan |
| 2.9 | 13-10-2026 | Collapsible sidebar (72 px icon rail on desktop, remembered per user) whose freed width goes to the content; every page uses the full content width (no narrower single-column pages); register stages collapsed by default with collapsible risk type sub-sections | Direktorat Data dan Kecerdasan Buatan |
| 2.8 | 13-10-2026 | Assessment by statement: scorers pick a configured statement per score value; numeric scores and averages hidden from all user views; ScoreOption added to score band versions | Direktorat Data dan Kecerdasan Buatan |
| 2.7 | 11-10-2026 | Design system adopted (DesignSystem_SIMARIO.md, Aksara-based): §2.2 rewritten to reference it; position switcher moved from topbar to a sidebar card; full palette hex values | Direktorat Data dan Kecerdasan Buatan |
| 2.6 | 11-10-2026 | Product Owner assigned; process-owner walkthrough completed; OQ-1, 2, 4, 6, 11 closed; seed data from the Rapim deck declared final | Direktorat Data dan Kecerdasan Buatan |
| 2.5 | 11-10-2026 | Re-review: viewer-dependent blindness for late directorates (VIS-9), holding rule on the acting position, archiving at the extended hard limit only, exclusion rules, comment attribution to an open earlier quarter, band version per quarter everywhere, per-quarter filters, Operator promotion in all paths, permission 10 locked to Lini 3 | Direktorat Data dan Kecerdasan Buatan |
| 2.4 | 11-10-2026 | Independent review: blindness across derived views and audit, late-directorate blindness, Superadmin oversight permissions and no content actions without a holding, Pokja drafting rule and Pengisi changes, Operator promotion, immediate Alih Pejabat, assignments by quarter of the object, expected Lini 3 set, archiving rules, band version per quarter, import columns, data model completions | Direktorat Data dan Kecerdasan Buatan |
| 2.3 | 11-10-2026 | End-to-end review: per-risk finalising, explanations per directorate, configurable assessment windows, hard archive limit, numbered print snapshots and automatic sheet versions, obligation-based Home, bulk CSV import, blind-phase guidance | Direktorat Data dan Kecerdasan Buatan |
| 2.2 | 10-10-2026 | Flow: annual register, risk board with threads, quarterly blind assessment by Lini 1 and both Lini 3 directorates, comparison and explanation, confidential attachments, derived Lembar Komunikasi and Lembar Mutu, new information architecture | Direktorat Data dan Kecerdasan Buatan |

## G. Approval Checklist

- [x] Every role in §1.4 appears in at least one user story
- [x] Every scope and participation rule in §1.5 and §2.7 is governed by an FR
- [x] Every user story has at least one derived FR
- [x] Every FR has acceptance criteria that can be tested pass/fail
- [x] Every page in §1.8 has a wireframe block
- [x] Every wireframe carries Layout, Components, Behavior
- [x] Final copy written for error messages, button labels, and warnings
- [x] §1.10 Out of Scope filled in
- [x] Data model and invariants listed (§2.8)
- [x] Every validation gate checked against §2.6
- [x] Release-blocking open items answered by the process owner (v2.6); remaining: OQ-3 and OQ-12 (release), OQ-8 (configuration), OQ-5 (v1.1)
- [x] Product Owner assigned — Binsar H. Simanjuntak
- [x] OQ-1, OQ-2, OQ-6, OQ-11 closed
- [x] Independent end-to-end review completed (three rounds, v2.3–v2.5) and findings resolved
- [x] Walkthrough with the process owner completed

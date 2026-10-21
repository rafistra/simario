// importApi over HTTP (docs/03_api_contract.md §4.13). Same signatures as data/api/importer.ts.
// A dry run is stored on the server as an ImportJob; "Terapkan" commits that job, which the
// server checks again against current data. The CSV template stays a local derivation of the
// position types (the page builds the download synchronously).

import {
  IMPORT_PERMISSION,
  importApi as localImportApi,
  type DryRun,
  type ImportError,
  type ImportJob,
  type ImportKind,
} from '../api/importer';
import { useCollectionCache } from '@/lib/useCollections';
import { useMe } from '@/state/me';
import { apiFetch } from './client';
import type { CollectionName } from './collections';

interface Job {
  id: string;
  kind: ImportKind;
  rows: number;
  valid: number;
  errors: ImportError[];
}

const CHANGES: Record<ImportKind, CollectionName[]> = {
  jabatan: ['positions'],
  pejabat: ['users', 'occupancies', 'delegates'],
  penugasan: ['assignments'],
};

/** Last dry-run job per kind and text, so apply(kind, text) commits what the user checked. */
const jobs = new Map<string, string>();
const key = (kind: ImportKind, text: string) => `${kind}\n${text}`;

async function dryRunJob(kind: ImportKind, text: string): Promise<Job> {
  const job = await apiFetch<Job>('/imports', { method: 'POST', body: { kind, text } });
  jobs.set(key(kind, text), job.id);
  return job;
}

export const importApi = {
  template: (kind: ImportKind) => localImportApi.template(kind),

  dryRun: async (kind: ImportKind, text: string): Promise<DryRun> => {
    const job = await dryRunJob(kind, text);
    return { kind, rows: job.rows, valid: job.valid, errors: job.errors };
  },

  apply: async (kind: ImportKind, text: string): Promise<number> => {
    const id = jobs.get(key(kind, text)) ?? (await dryRunJob(kind, text)).id;
    const job = await apiFetch<Job>(`/imports/${id}/commit`, { method: 'POST' });
    jobs.delete(key(kind, text));
    await useCollectionCache.getState().load(CHANGES[kind]);
    return job.rows;
  },

  history: () => apiFetch<ImportJob[]>('/imports'),

  /** Kinds the signed-in user may import (permissions from /me). */
  kindsFor: (userId: string, today: string): ImportKind[] => {
    void userId;
    void today;
    const codes = new Set(useMe.getState().me?.permissions.map((p) => p.code) ?? []);
    return (Object.keys(IMPORT_PERMISSION) as ImportKind[]).filter((k) =>
      codes.has(IMPORT_PERMISSION[k]),
    );
  },
};

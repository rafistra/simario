// registerApi over HTTP (docs/03_api_contract.md §4.4). Same signatures as data/api/register.ts.
// The Register page reads views through useRegisterViews; every mutation reloads the cached
// views before resolving, so the page shows the server state as it did with the local store.

import { create } from 'zustand';
import type { DataUmumValues, RiskType } from '@/domain/types';
import type { CopySummary, PublishSummary, RegisterKey } from '../api/register';
import type { RegisterView } from '../api/registerView';
import { apiFetch, type FetchInit } from './client';

const keyOf = (key: RegisterKey) => `${key.positionId}:${key.fiscalYear}`;
const base = (key: RegisterKey) => `/registers/${key.positionId}/${key.fiscalYear}`;

interface ViewCache {
  views: Record<string, RegisterView | undefined>;
  errors: Record<string, string | undefined>;
  load: (key: RegisterKey) => Promise<void>;
  reloadAll: () => Promise<void>;
}

export const useRegisterViews = create<ViewCache>((set, get) => ({
  views: {},
  errors: {},
  load: async (key) => {
    const k = keyOf(key);
    try {
      const view = await apiFetch<RegisterView>(base(key));
      set((s) => ({ views: { ...s.views, [k]: view }, errors: { ...s.errors, [k]: undefined } }));
    } catch (e) {
      set((s) => ({ errors: { ...s.errors, [k]: (e as Error).message } }));
    }
  },
  reloadAll: async () => {
    await Promise.all(
      Object.keys(get().views).map((k) => {
        const [positionId, year] = k.split(':');
        return get().load({ positionId: positionId!, fiscalYear: Number(year) });
      }),
    );
  },
}));

async function mutate<T>(path: string, init: FetchInit): Promise<T> {
  const result = await apiFetch<T>(path, init);
  await useRegisterViews.getState().reloadAll();
  return result;
}

export const registerApi = {
  view: async (key: RegisterKey) => {
    await useRegisterViews.getState().load(key);
    const k = keyOf(key);
    const { views, errors } = useRegisterViews.getState();
    if (errors[k] || !views[k]) throw new Error(errors[k] ?? 'Data tidak ditemukan.');
    return views[k];
  },

  toggleTemplateRisk: (key: RegisterKey, templateId: string, selected: boolean) =>
    mutate<void>(`${base(key)}/template-risks/${templateId}`, {
      method: 'PUT',
      body: { selected },
    }),

  addCustomRisk: async (
    key: RegisterKey,
    stageId: string,
    riskType: RiskType,
    description: string,
  ) =>
    (
      await mutate<{ id: string }>(`${base(key)}/risks`, {
        method: 'POST',
        body: { stageId, riskType, description },
      })
    ).id,

  deleteRisk: (riskId: string) => mutate<void>(`/register-risks/${riskId}`, { method: 'DELETE' }),

  toggleTemplateMitigation: (riskId: string, mitigationTemplateId: string, selected: boolean) =>
    mutate<void>(`/register-risks/${riskId}/template-mitigations/${mitigationTemplateId}`, {
      method: 'PUT',
      body: { selected },
    }),

  addCustomMitigation: (riskId: string, text: string) =>
    mutate<void>(`/register-risks/${riskId}/mitigations`, { method: 'POST', body: { text } }),

  deleteMitigation: (mitigationId: string) =>
    mutate<void>(`/register-mitigations/${mitigationId}`, { method: 'DELETE' }),

  setDeclaration: (
    key: RegisterKey,
    stageId: string,
    riskType: RiskType | null,
    on: boolean,
    force = false,
  ) =>
    mutate<void>(`${base(key)}/declarations`, {
      method: 'PUT',
      body: { stageId, riskType, on, force },
    }),

  setDeclarationReason: (
    key: RegisterKey,
    stageId: string,
    riskType: RiskType | null,
    reason: string,
  ) =>
    mutate<void>(`${base(key)}/declarations`, {
      method: 'PATCH',
      body: { stageId, riskType, reason },
    }),

  updateDataUmum: (key: RegisterKey, patch: Partial<DataUmumValues>) =>
    mutate<void>(base(key), { method: 'PATCH', body: patch }),

  markReady: (key: RegisterKey) => mutate<void>(`${base(key)}/mark-ready`, { method: 'POST' }),

  publish: (key: RegisterKey) => mutate<PublishSummary>(`${base(key)}/publish`, { method: 'POST' }),

  deactivateRisk: (riskId: string, reason: string) =>
    mutate<void>(`/register-risks/${riskId}/deactivate`, { method: 'POST', body: { reason } }),

  deactivateMitigation: (mitigationId: string, reason: string) =>
    mutate<void>(`/register-mitigations/${mitigationId}/deactivate`, {
      method: 'POST',
      body: { reason },
    }),

  copyFromPrevious: (key: RegisterKey) =>
    mutate<CopySummary>(`${base(key)}/copy-from-previous`, { method: 'POST' }),
};

// masterApi over HTTP (docs/03_api_contract.md §4.3). Same signatures as data/api/master.ts.
// Each mutation reloads the collections it changes before resolving, so pages reading them
// through useCollections show the result as they did with the local store. Risk proposals (B3)
// are read through proposalApi.list.

import type { OptionInput, PositionInput } from '@/test/fake/api/master';
import type { DataUmumField, RiskProposal, RiskType, ScoreBand } from '@/domain/types';
import { useCollectionCache } from '@/lib/useCollections';
import { apiFetch, type FetchInit } from './client';
import type { CollectionName } from './collections';

const POSITIONS: CollectionName[] = ['positions', 'delegates'];
const TEMPLATES: CollectionName[] = ['riskTemplates', 'mitigationTemplates'];
const BANDS: CollectionName[] = ['scoreBandVersions', 'scoreBands', 'scoreOptions'];

async function mutate<T>(path: string, init: FetchInit, changes: CollectionName[]): Promise<T> {
  const result = await apiFetch<T>(path, init);
  await useCollectionCache.getState().load(changes);
  return result;
}

type BandInput = Pick<
  ScoreBand,
  'lowerExclusive' | 'upperInclusive' | 'predicate' | 'order' | 'guidance'
>;

const bandBody = (effectiveFrom: string, bands: BandInput[], options: OptionInput[]) => ({
  effectiveFrom,
  bands: bands.map(({ lowerExclusive, upperInclusive, predicate, order, guidance }) => ({
    lowerExclusive,
    upperInclusive,
    predicate,
    order,
    guidance: guidance ?? '',
  })),
  options: options.map(({ id, value, label }) => ({ id, value, label })),
});

export const masterApi = {
  setPositionTypeActive: (typeId: string, active: boolean) =>
    mutate<void>(`/position-types/${typeId}`, { method: 'PATCH', body: { active } }, [
      'positionTypes',
    ]),

  savePosition: async (input: PositionInput, id?: string) =>
    (
      await mutate<{ id: string }>(
        id ? `/positions/${id}` : '/positions',
        { method: id ? 'PUT' : 'POST', body: input },
        POSITIONS,
      )
    ).id,

  deactivatePosition: (positionId: string, reason: string) =>
    mutate<void>(
      `/positions/${positionId}/deactivate`,
      { method: 'POST', body: { reason } },
      POSITIONS,
    ),

  reactivatePosition: (positionId: string) =>
    mutate<void>(`/positions/${positionId}/reactivate`, { method: 'POST' }, POSITIONS),

  renameStage: (stageId: string, name: string) =>
    mutate<void>(`/stages/${stageId}`, { method: 'PATCH', body: { name } }, ['stages']),

  addStage: async (positionTypeId: string, name: string) =>
    (
      await mutate<{ id: string }>('/stages', { method: 'POST', body: { positionTypeId, name } }, [
        'stages',
      ])
    ).id,

  reorderStages: (positionTypeId: string, orderedIds: string[]) =>
    mutate<void>(
      `/position-types/${positionTypeId}/stage-order`,
      { method: 'PUT', body: { orderedIds } },
      ['stages'],
    ),

  setStageActive: (stageId: string, active: boolean) =>
    mutate<void>(`/stages/${stageId}`, { method: 'PATCH', body: { active } }, ['stages']),

  deleteStage: (stageId: string) =>
    mutate<void>(`/stages/${stageId}`, { method: 'DELETE' }, ['stages']),

  saveTemplate: async (
    input: {
      positionTypeId: string;
      stageId: string;
      riskType: RiskType;
      description: string;
      mitigations: string[];
    },
    id?: string,
    fromProposalId?: string,
  ) => {
    const res = await mutate<{ id: string }>(
      fromProposalId
        ? `/proposals/${fromProposalId}/accept`
        : id
          ? `/risk-templates/${id}`
          : '/risk-templates',
      { method: id && !fromProposalId ? 'PUT' : 'POST', body: input },
      TEMPLATES,
    );
    return res.id;
  },

  setTemplateActive: (templateId: string, active: boolean) =>
    mutate<void>(`/risk-templates/${templateId}`, { method: 'PATCH', body: { active } }, TEMPLATES),

  deleteTemplate: (templateId: string) =>
    mutate<void>(`/risk-templates/${templateId}`, { method: 'DELETE' }, TEMPLATES),

  rejectProposal: (proposalId: string, reason: string) =>
    apiFetch<void>(`/proposals/${proposalId}/reject`, { method: 'POST', body: { reason } }),

  saveDataUmumForm: async (
    positionTypeId: string,
    defaultObjective: string,
    fields: DataUmumField[],
    objectiveEnabled = false,
  ) =>
    (
      await mutate<{ version: number }>(
        `/position-types/${positionTypeId}/data-umum-forms`,
        { method: 'POST', body: { defaultObjective, fields, objectiveEnabled } },
        ['dataUmumForms'],
      )
    ).version,

  createBandDraft: async (effectiveFrom: string) =>
    (
      await mutate<{ id: string }>(
        '/score-band-versions',
        { method: 'POST', body: { effectiveFrom } },
        BANDS,
      )
    ).id,

  saveBandVersion: (
    versionId: string,
    patch: { effectiveFrom: string; bands: BandInput[]; options: OptionInput[] },
  ) =>
    mutate<void>(
      `/score-band-versions/${versionId}/schedule`,
      { method: 'POST', body: bandBody(patch.effectiveFrom, patch.bands, patch.options) },
      BANDS,
    ),

  updateBandDraft: (
    versionId: string,
    bands: ScoreBand[],
    effectiveFrom: string,
    options: OptionInput[],
  ) =>
    mutate<void>(
      `/score-band-versions/${versionId}`,
      { method: 'PUT', body: bandBody(effectiveFrom, bands, options) },
      BANDS,
    ),

  discardBandDraft: (versionId: string) =>
    mutate<void>(`/score-band-versions/${versionId}`, { method: 'DELETE' }, BANDS),

  updateActiveGuidance: (predicate: ScoreBand['predicate'], guidance: string) =>
    mutate<void>(`/score-bands/${predicate}`, { method: 'PATCH', body: { guidance } }, BANDS),

  updateOptionLabel: (optionId: string, label: string) =>
    mutate<void>(`/score-options/${optionId}`, { method: 'PATCH', body: { label } }, BANDS),
};

/** A proposal row with its source risk's context (GET /api/v1/proposals). */
export interface ProposalRow extends RiskProposal {
  proposerName: string;
  positionId: string;
  positionName: string;
  positionTypeId: string;
  positionTypeName: string;
  stageId: string;
  stageName: string;
  riskType: RiskType;
  mitigations: string[];
}

export const proposalApi = {
  list: () => apiFetch<ProposalRow[]>('/proposals'),
};

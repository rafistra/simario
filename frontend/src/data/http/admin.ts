// adminApi over HTTP (docs/03_api_contract.md §4.11). Same signatures as data/api/admin.ts.
// Mutations reload the collections they change before resolving, and refresh /me because
// holdings, roles and delegations decide what the signed-in user may do (FR-AUT-008).

import type { AssignInput, ReplaceInput } from '@/test/fake/api/admin';
import type { MonitoringSupport, Scope } from '@/domain/types';
import { useCollectionCache } from '@/lib/useCollections';
import { useMe } from '@/state/me';
import { apiFetch, type FetchInit } from './client';
import type { CollectionName } from './collections';

const USERS: CollectionName[] = ['users', 'userRoles'];
const HOLDINGS: CollectionName[] = ['users', 'occupancies', 'delegates'];
const ROLES: CollectionName[] = ['roles', 'rolePermissions'];

async function mutate<T>(path: string, init: FetchInit, changes: CollectionName[]): Promise<T> {
  const result = await apiFetch<T>(path, init);
  await Promise.all([useCollectionCache.getState().load(changes), useMe.getState().refresh()]);
  return result;
}

/** An empty date input means "not filled"; the server reports it with the prototype's copy. */
const dateOrNull = (value: string | null | undefined) => value || null;

export interface StaffRow {
  nip: string;
  fullName: string;
  email: string;
  orgUnitId: string;
}

export const adminApi = {
  addUser: async (input: {
    nip: string;
    fullName: string;
    email: string;
    orgUnitId: string;
    isLocalAccount: boolean;
  }) => {
    const res = await mutate<{ id: string; temporaryPassword: string | null }>(
      '/users',
      { method: 'POST', body: { ...input, orgUnitId: input.orgUnitId || null } },
      USERS,
    );
    return { id: res.id, tempPassword: res.temporaryPassword };
  },

  setManualRoles: (userId: string, roleIds: string[]) =>
    mutate<void>(`/users/${userId}/roles`, { method: 'PUT', body: { roleIds } }, USERS),

  assignPosition: (input: AssignInput) =>
    mutate<{ occupancyId: string; promoted: number; fillerChanged: number }>(
      '/occupancies',
      { method: 'POST', body: { ...input, decreeDate: dateOrNull(input.decreeDate) } },
      HOLDINGS,
    ),

  replaceOfficial: (input: ReplaceInput) => {
    const { positionId, ...rest } = input;
    return mutate<{ operatorsEnded: number; promoted: number }>(
      `/positions/${positionId}/replace-official`,
      { method: 'POST', body: { ...rest, decreeDate: dateOrNull(rest.decreeDate) } },
      HOLDINGS,
    );
  },

  moveFiller: async (positionId: string, toOccupancyId: string) =>
    (
      await mutate<{ operatorsEnded: number }>(
        `/positions/${positionId}/filler`,
        { method: 'POST', body: { toOccupancyId } },
        HOLDINGS,
      )
    ).operatorsEnded,

  resetPassword: async (userId: string) =>
    (
      await apiFetch<{ temporaryPassword: string }>(`/users/${userId}/reset-password`, {
        method: 'POST',
      })
    ).temporaryPassword,

  deactivateUser: (userId: string) =>
    mutate<{
      occupancies: number;
      delegations: number;
      appointedOperators: number;
      fillerBlock: string | null;
    }>(`/users/${userId}/deactivate`, { method: 'POST' }, HOLDINGS),

  reactivateUser: (userId: string) =>
    mutate<void>(`/users/${userId}/reactivate`, { method: 'POST' }, USERS),

  addRole: async (name: string) =>
    (await mutate<{ id: string }>('/roles', { method: 'POST', body: { name } }, ROLES)).id,

  deleteRole: (roleId: string) => mutate<void>(`/roles/${roleId}`, { method: 'DELETE' }, ROLES),

  setPermission: (roleId: string, code: number, enabled: boolean, scope: Scope | null) =>
    mutate<void>(
      `/roles/${roleId}/permissions/${code}`,
      { method: 'PUT', body: { enabled, scope } },
      ROLES,
    ),

  addAssignments: (input: {
    targets: string[];
    lead: string;
    supports: MonitoringSupport[];
    fromQuarterId: string;
    toQuarterId: string;
    decreeNo: string;
  }) =>
    mutate<void>(
      '/monitoring-assignments',
      {
        method: 'POST',
        body: {
          targetPositionIds: input.targets,
          leadPositionId: input.lead || null,
          supports: input.supports,
          quarterFromId: input.fromQuarterId,
          quarterToId: input.toQuarterId,
          decreeNo: input.decreeNo,
        },
      },
      ['assignments'],
    ),

  removeAssignment: (id: string) =>
    mutate<void>(`/monitoring-assignments/${id}`, { method: 'DELETE' }, ['assignments']),

  searchStaff: (query: string) =>
    query.trim().length < 2
      ? Promise.resolve([] as StaffRow[])
      : apiFetch<StaffRow[]>('/staff', { query: { q: query.trim() } }),

  appointOperator: async (input: {
    positionId: string;
    nip: string;
    letterNo: string;
    letterDate: string;
    letterFile: string;
    endDate: string | null;
  }) => {
    const { positionId, ...rest } = input;
    const res = await mutate<{ id: string }>(
      `/positions/${positionId}/delegates`,
      {
        method: 'POST',
        body: {
          ...rest,
          letterDate: dateOrNull(rest.letterDate),
          endDate: dateOrNull(rest.endDate),
        },
      },
      HOLDINGS,
    );
    return res.id;
  },

  revokeOperator: (delegateId: string) =>
    mutate<void>(`/delegates/${delegateId}/revoke`, { method: 'POST' }, HOLDINGS),
};

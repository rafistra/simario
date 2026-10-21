// Position workspace header over HTTP (B9): the server decides 404 / 403 and returns the header.

import type { Position } from '@/domain/types';
import { apiFetch } from './client';

export interface WorkspaceHeader {
  position: Position;
  unit: { id: string; code: string; name: string };
  years: { year: number; archived: boolean }[];
  officials: { name: string; isFiller: boolean }[];
  operators: string[];
}

export const workspaceApi = {
  header: (positionId: string, fiscalYear: number) =>
    apiFetch<WorkspaceHeader>(`/positions/${positionId}/workspace?ta=${fiscalYear}`),
};

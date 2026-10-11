// Pages declare their breadcrumb and contextual topbar button; the shell renders them.

import type { LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';

export interface ContextAction {
  label: string;
  icon?: LucideIcon;
  to: string;
}

interface PageMetaState {
  crumbs: string[];
  context: ContextAction | null;
  set: (crumbs: string[], context: ContextAction | null) => void;
}

export const usePageMetaStore = create<PageMetaState>((set) => ({
  crumbs: [],
  context: null,
  set: (crumbs, context) => set({ crumbs, context }),
}));

export function usePageMeta(crumbs: string[], context: ContextAction | null = null) {
  const key = JSON.stringify([crumbs, context?.label, context?.to]);
  useEffect(() => {
    usePageMetaStore.getState().set(crumbs, context);
    document.title = `${crumbs.at(-1) ?? 'SIMARIO'} · SIMARIO`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

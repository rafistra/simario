import { Construction } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components';
import { usePageMeta } from '@/layout/pageMeta';

export interface PlaceholderProps {
  crumbs: string[];
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** Checkpoint stage that builds this page (CLAUDE.md §9). */
  stage: number;
  /** Inside a workspace the header already exists. */
  bare?: boolean;
}

/** Routed page that a later stage builds. Clearly marked so testers know it is not missing. */
export function Placeholder({ crumbs, title, eyebrow, subtitle, stage, bare }: PlaceholderProps) {
  usePageMeta(crumbs);
  return (
    <>
      {!bare && <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />}
      <EmptyState
        icon={Construction}
        title={`${title} dibangun pada Tahap ${stage}`}
        message="Rute, akses, dan navigasinya sudah aktif. Isi halaman menyusul sesuai urutan checkpoint di CLAUDE.md."
      />
    </>
  );
}

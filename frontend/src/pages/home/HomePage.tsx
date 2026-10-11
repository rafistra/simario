import { Construction } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDateLong } from '@/lib/format';
import { useAuth } from '@/state/useAuth';

/** Home (/). Greeting follows the acting holding; the cards (FR-BRD-010) arrive in Tahap 7. */
export default function HomePage() {
  const auth = useAuth();
  usePageMeta(['Beranda']);
  const active = auth.active;
  const greeting = active
    ? `Selamat datang, ${auth.user.fullName}. Anda bekerja sebagai ${active.capacity === 'pejabat' ? 'Pejabat' : 'Operator'} ${active.position.name}${active.line === 1 ? ` · ${active.unitCode}` : ''}.`
    : `Selamat datang, ${auth.user.fullName}.`;
  return (
    <>
      <PageHeader eyebrow={formatDateLong(auth.today)} title="Beranda" subtitle={greeting} />
      <EmptyState
        icon={Construction}
        title="Kartu Beranda dibangun pada Tahap 7"
        message="Kewajiban penilaian, tindakan, status register, hasil triwulan, dan aktivitas terbaru akan tampil di sini sesuai jabatan aktif Anda."
      />
    </>
  );
}

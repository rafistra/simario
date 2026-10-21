import { BellOff, CheckCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  EmptyState,
  FilterPills,
  InlineAlert,
  NotificationItem,
  PageHeader,
  Pagination,
  Skeleton,
} from '@/components';
import type { Notification } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { kindLabel } from '@/lib/notificationKinds';
import { useNotifications } from '@/state/notifications';
import { useAuth } from '@/state/useAuth';
import '@/components/NotificationPanel/NotificationPanel.css';
import './Notifications.css';

const PAGE = 25;

/** /notifikasi — FR-NTF-014: kind and read-state filters (AND), 25 per page, state in the URL. */
export default function NotificationsPage() {
  usePageMeta(['Beranda', 'Notifikasi']);
  const auth = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const kinds = params.get('jenis')?.split(',').filter(Boolean) ?? [];
  const status = params.get('status') ?? '';
  const page = Math.max(1, Number(params.get('halaman') ?? 1));
  const ntf = useNotifications(auth.user.id);
  const all = ntf.items;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('halaman' in patch)) next.delete('halaman');
    setParams(next, { replace: true });
  };

  const byKind = (n: Notification) => kinds.length === 0 || kinds.includes(kindLabel(n.kind));
  const byStatus = (n: Notification) => !status || (status === 'belum' ? !n.readAt : !!n.readAt);
  const filtered = all.filter((n) => byKind(n) && byStatus(n));
  const labels = [...new Set(all.map((n) => kindLabel(n.kind)))];
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const unread = all.filter((n) => !n.readAt).length;

  if (ntf.error)
    return (
      <div className="ntf-page">
        <InlineAlert variant="error" title="Notifikasi tidak dapat dimuat" onRetry={ntf.retry}>
          {ntf.error}
        </InlineAlert>
      </div>
    );
  if (!ntf.loaded)
    return (
      <div className="ntf-page" role="status" aria-live="polite">
        <Skeleton height={28} width="40%" />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );

  return (
    <div className="ntf-page">
      <PageHeader
        title="Semua Notifikasi"
        subtitle={`${all.length} notifikasi · ${unread} belum dibaca`}
        actions={
          unread > 0 ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void ntf.markAllRead()}
            >
              <CheckCheck className="btn__icon" aria-hidden />
              <span>Tandai semua sudah dibaca</span>
            </button>
          ) : undefined
        }
      />
      <FilterPills
        label="Jenis"
        items={labels.map((l) => ({
          value: l,
          label: l,
          count: all.filter((n) => kindLabel(n.kind) === l && byStatus(n)).length,
        }))}
        selected={kinds}
        onToggle={(v) =>
          set({
            jenis:
              (kinds.includes(v) ? kinds.filter((k) => k !== v) : [...kinds, v]).join(',') || null,
          })
        }
      />
      <FilterPills
        label="Status baca"
        items={[
          {
            value: 'belum',
            label: 'Belum dibaca',
            count: all.filter((n) => !n.readAt && byKind(n)).length,
          },
          {
            value: 'sudah',
            label: 'Sudah dibaca',
            count: all.filter((n) => !!n.readAt && byKind(n)).length,
          },
        ]}
        selected={status ? [status] : []}
        onToggle={(v) => set({ status: status === v ? null : v })}
      />
      {all.length === 0 ? (
        <EmptyState icon={BellOff} title="Belum ada pemberitahuan" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Tidak ada notifikasi pada filter ini"
          action={
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setParams({}, { replace: true })}
            >
              <span>Hapus filter</span>
            </button>
          }
        />
      ) : (
        <>
          <ul className="ntf-page__list">
            {shown.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                relative={false}
                onOpen={(x) => {
                  void ntf.markRead(x.id);
                  navigate(x.targetUrl);
                }}
              />
            ))}
          </ul>
          {pages > 1 && (
            <Pagination
              page={page}
              pageSize={PAGE}
              total={filtered.length}
              onChange={(p) => set({ halaman: String(p) })}
            />
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '@/state/notifications';
import type { Notification } from '@/domain/types';
import { formatDateTime, formatRelative } from '@/lib/format';
import { kindLabel, NOTIFICATION_KINDS } from '@/lib/notificationKinds';
import { useNow } from '@/state/clock';
import './NotificationPanel.css';

export function NotificationItem({
  n,
  relative,
  onOpen,
}: {
  n: Notification;
  relative: boolean;
  onOpen: (n: Notification) => void;
}) {
  const at = useNow(60_000);
  const tone = NOTIFICATION_KINDS[n.kind]?.tone ?? 'info';
  return (
    <li>
      <button
        type="button"
        className={['ntf-item', !n.readAt && 'is-unread'].filter(Boolean).join(' ')}
        onClick={() => onOpen(n)}
      >
        <span className={`ntf-item__dot ntf-item__dot--${tone}`} aria-hidden />
        <span className="ntf-item__body">
          <span className="ntf-item__kind">{kindLabel(n.kind)}</span>
          <span className="ntf-item__text">{n.text}</span>
          <span className="ntf-item__time t-mono">
            {relative ? formatRelative(n.createdAt, at) : formatDateTime(n.createdAt)}
          </span>
        </span>
        {!n.readAt && <span className="sr-only">(belum dibaca)</span>}
      </button>
    </li>
  );
}

/** NotificationPanel (.pen vRY3q, FR-NTF-013): 380 px dropdown, 20 most recent. */
export function NotificationPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const ntf = useNotifications(userId);
  const items = ntf.items.slice(0, 20);
  const unread = items.some((n) => !n.readAt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('.bell')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    ref.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const open = (n: Notification) => {
    void ntf.markRead(n.id);
    onClose();
    navigate(n.targetUrl);
  };

  return (
    <div ref={ref} className="ntf-panel" role="dialog" aria-label="Notifikasi">
      <header className="ntf-panel__head">
        <h2 className="ntf-panel__title">Notifikasi</h2>
        {unread && (
          <button
            type="button"
            className="text-link ntf-panel__all"
            onClick={() => void ntf.markAllRead()}
          >
            Tandai semua sudah dibaca
          </button>
        )}
      </header>
      {items.length === 0 ? (
        <p className="ntf-panel__empty">Belum ada pemberitahuan</p>
      ) : (
        <ul className="ntf-panel__list">
          {items.map((n) => (
            <NotificationItem key={n.id} n={n} relative onOpen={open} />
          ))}
        </ul>
      )}
      <footer className="ntf-panel__foot">
        <Link to="/notifikasi" onClick={onClose}>
          Lihat semua
        </Link>
      </footer>
    </div>
  );
}

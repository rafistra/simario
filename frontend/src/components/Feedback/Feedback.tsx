import {
  CircleAlert,
  CircleCheck,
  FileText,
  Info,
  RotateCw,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useToastStore, type ToastItem } from './toastStore';
import './Feedback.css';

export type AlertVariant = 'info' | 'warning' | 'error' | 'success';

const ALERT_ICON: Record<AlertVariant, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  success: CircleCheck,
};

export interface InlineAlertProps {
  variant: AlertVariant;
  title: ReactNode;
  children?: ReactNode;
  /** Error variant: "Coba Lagi" retries the failed request (PRD §2.4). */
  onRetry?: () => void;
  className?: string;
}

/** InlineAlert_Info / _Warning / _Error / _Success (.pen Iaokf, wxAse, Q7oSz, uYwKh). */
export function InlineAlert({ variant, title, children, onRetry, className }: InlineAlertProps) {
  const Icon = ALERT_ICON[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={['alert', `alert--${variant}`, className].filter(Boolean).join(' ')}
    >
      <Icon className="alert__icon" aria-hidden />
      <div className="alert__text">
        <p className="alert__title">{title}</p>
        {children && <div className="alert__message">{children}</div>}
      </div>
      {onRetry && (
        <button type="button" className="alert__retry" onClick={onRetry}>
          <RotateCw aria-hidden />
          Coba Lagi
        </button>
      )}
    </div>
  );
}

/* ---------- Toast ---------- */

const TOAST_MS = 4000;

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const timer = useRef<number | undefined>(undefined);
  const start = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => dismiss(item.id), TOAST_MS);
  };
  const pause = () => window.clearTimeout(timer.current);
  useEffect(() => {
    start();
    return pause;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Icon = item.variant === 'success' ? CircleCheck : CircleAlert;
  return (
    <div
      role={item.variant === 'error' ? 'alert' : 'status'}
      className={`toast toast--${item.variant}`}
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
    >
      <span className="toast__edge" aria-hidden />
      <Icon className="toast__icon" aria-hidden />
      <div className="toast__text">
        <p className="toast__title">{item.title}</p>
        {item.message && <p className="toast__message">{item.message}</p>}
      </div>
      <button
        type="button"
        className="toast__close"
        aria-label="Tutup pemberitahuan"
        onClick={() => dismiss(item.id)}
      >
        <X aria-hidden />
      </button>
    </div>
  );
}

/** Toast_Success / _Error (.pen NWudo, d0bBE): top right, 4 s, pause on hover/focus. Mount once. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}

/* ---------- EmptyState ---------- */

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  message?: ReactNode;
  /** Primary action where one exists (PRD §2.4); none for no-permission states. */
  action?: ReactNode;
  className?: string;
}

/** EmptyState (.pen uwOgk): Tirta circle icon, Newsreader title, one sentence, action. */
export function EmptyState({
  icon: Icon = FileText,
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={['empty-state', className].filter(Boolean).join(' ')}>
      <span className="empty-state__icon" aria-hidden>
        <Icon />
      </span>
      <h2 className="empty-state__title">{title}</h2>
      {message && <p className="empty-state__message">{message}</p>}
      {action && <div className="empty-state__actions">{action}</div>}
    </div>
  );
}

/* ---------- Skeleton ---------- */

export interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

/** Skeleton bar (UXStates skeleton frames): resembles the final layout, static under reduced motion. */
export function Skeleton({ width = '100%', height = 14, radius = 'sm', className }: SkeletonProps) {
  return (
    <span
      className={['skeleton', `skeleton--${radius}`, className].filter(Boolean).join(' ')}
      style={{ width, height }}
      aria-hidden
    />
  );
}

/** Wrap a loading region: announces "Memuat…" and sets aria-busy. */
export function LoadingRegion({
  children,
  label = 'Memuat…',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { Button } from '../Button/Button';
import './Overlay.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive confirm uses the red button and puts initial focus on "Batal" (AccessibilityContract). */
  destructive?: boolean;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** ConfirmDialog (.pen xr6zc): 480 wide, radius 16, shadow-lg, display-sm title. role=alertdialog. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Batal',
  destructive = false,
  confirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useFocusTrap(ref, open, onCancel, destructive ? cancelRef : undefined);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay--center">
      <div className="overlay__scrim" onClick={onCancel} aria-hidden />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        className="dialog"
      >
        <header className="dialog__header">
          <h2 id={titleId} className="t-display-sm">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label="Tutup" onClick={onCancel}>
            <X aria-hidden />
          </button>
        </header>
        {children && (
          <div id={bodyId} className="dialog__body">
            {children}
          </div>
        )}
        <footer className="dialog__actions">
          <Button ref={cancelRef} variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            loading={confirming}
            loadingLabel="Memproses…"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export interface SlideOverProps {
  open: boolean;
  eyebrow?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

/** SlideOver (.pen rm4EY): 420 px from the right, full height; full width below 900 px. */
export function SlideOver({ open, eyebrow, title, children, footer, onClose }: SlideOverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay--right">
      <div className="overlay__scrim" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="slide-over"
      >
        <header className="slide-over__header">
          <div className="slide-over__titles">
            {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
            <h2 id={titleId} className="t-display-sm">
              {title}
            </h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Tutup" onClick={onClose}>
            <X aria-hidden />
          </button>
        </header>
        <div className="slide-over__body">{children}</div>
        {footer && <footer className="slide-over__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

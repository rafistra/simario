import { CloudCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import './BottomBar.css';

export interface BottomBarProps {
  /** 'saving' shows "Menyimpan…"; 'saved' shows "Draf tersimpan" + time; null hides autosave. */
  autosave?: { state: 'saving' | 'saved' | 'error'; time?: string } | null;
  progress?: ReactNode;
  progressTone?: 'default' | 'danger';
  children?: ReactNode;
}

/**
 * BottomBar (.pen s2i9Vb): sticky bar for register drafting and assessment pages (PRD §2.4).
 * Left: autosave indicator (aria-live=polite) and mono progress; right: actions.
 */
export function BottomBar({
  autosave,
  progress,
  progressTone = 'default',
  children,
}: BottomBarProps) {
  return (
    <div className="bottom-bar" role="region" aria-label="Status dan tindakan">
      <div className="bottom-bar__status">
        {autosave && (
          <span className="bottom-bar__autosave" aria-live="polite">
            {autosave.state === 'saving' ? (
              <>
                <LoaderCircle className="spin" aria-hidden /> Menyimpan…
              </>
            ) : autosave.state === 'error' ? (
              <>
                <TriangleAlert className="bottom-bar__warn" aria-hidden /> Belum tersimpan
              </>
            ) : (
              <>
                <CloudCheck className="bottom-bar__ok" aria-hidden /> Draf tersimpan
                {autosave.time && <span className="bottom-bar__time">{autosave.time}</span>}
              </>
            )}
          </span>
        )}
        {autosave && progress && <span className="bottom-bar__divider" aria-hidden />}
        {progress && (
          <span
            className={['bottom-bar__progress', progressTone === 'danger' && 'is-danger']
              .filter(Boolean)
              .join(' ')}
          >
            {progress}
          </span>
        )}
      </div>
      {children && <div className="bottom-bar__actions">{children}</div>}
    </div>
  );
}

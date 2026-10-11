import { Ellipsis } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** ⋯ row menu (role=menu); closes on outside click and Esc. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Ellipsis aria-hidden />
      </button>
      {open && (
        <div className="menu" role="menu">
          {items
            .filter((i) => !i.hidden)
            .map((i) => (
              <button
                key={i.label}
                type="button"
                role="menuitem"
                className={['menu__item', i.danger && 'menu__item--danger']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setOpen(false);
                  i.onSelect();
                }}
              >
                {i.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

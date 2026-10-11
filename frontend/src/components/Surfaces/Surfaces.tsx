import type { ReactNode } from 'react';
import './Surfaces.css';

export interface CardProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** Right side of the header: status chip, marker, or action. */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Clickable card variant (shadow-card-hover). */
  interactive?: boolean;
  as?: 'section' | 'article' | 'div';
}

/** Card (.pen cKHP4): surface, radius 16, shadow-card, padding 24 (16 on phone). Never nest cards. */
export function Card({
  eyebrow,
  title,
  aside,
  children,
  className,
  interactive,
  as: Tag = 'section',
}: CardProps) {
  return (
    <Tag
      className={['card', interactive && 'card--interactive', className].filter(Boolean).join(' ')}
    >
      {(eyebrow || title || aside) && (
        <header className="card__header">
          <div className="card__titles">
            {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
            {title && <h2 className="card__title">{title}</h2>}
          </div>
          {aside && <div className="card__aside">{aside}</div>}
        </header>
      )}
      {children !== undefined && <div className="card__body">{children}</div>}
    </Tag>
  );
}

export interface SummaryItem {
  figure: ReactNode;
  label: string;
  /** CSS colour for the status dot, e.g. 'var(--status-terbit-dot)'. */
  dot?: string;
  href?: string;
}

/** SummaryStrip (.pen v3DvkA): one card split by hairlines; Newsreader figures + dotted labels. */
export function SummaryStrip({ items, className }: { items: SummaryItem[]; className?: string }) {
  return (
    <ul className={['summary-strip', className].filter(Boolean).join(' ')}>
      {items.map((item) => {
        const content = (
          <>
            <span className="summary-strip__figure">{item.figure}</span>
            <span className="summary-strip__label">
              {item.dot && (
                <span className="summary-strip__dot" style={{ background: item.dot }} aria-hidden />
              )}
              {item.label}
            </span>
          </>
        );
        return (
          <li key={item.label} className="summary-strip__item">
            {item.href ? (
              <a className="summary-strip__cell summary-strip__cell--link" href={item.href}>
                {content}
              </a>
            ) : (
              <div className="summary-strip__cell">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface FilterPillItem {
  value: string;
  label: string;
  count?: number;
}

export interface FilterPillsProps {
  items: FilterPillItem[];
  /** Selected values (single- or multi-select is up to the caller). */
  selected: string[];
  onToggle: (value: string) => void;
  label: string;
  className?: string;
}

/** FilterPill / FilterPill_Active / FilterPills (.pen MTXKt, gfGHx, t8qGAG). */
export function FilterPills({ items, selected, onToggle, label, className }: FilterPillsProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={['filter-pills', className].filter(Boolean).join(' ')}
    >
      {items.map((item) => {
        const active = selected.includes(item.value);
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            className={['filter-pill', active && 'filter-pill--active'].filter(Boolean).join(' ')}
            onClick={() => onToggle(item.value)}
          >
            {item.label}
            {item.count !== undefined && <span className="filter-pill__count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** PageHeader (.pen vziSJ): mono eyebrow, Newsreader 40 title, muted subtitle, action right. */
export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
        <h1 className="t-display-lg">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

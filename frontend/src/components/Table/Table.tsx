import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import './Table.css';

export interface Column<Row> {
  key: string;
  header: string;
  /** Fixed width in px; omit for a flexible column. */
  width?: number;
  align?: 'left' | 'right';
  render: (row: Row) => ReactNode;
  /** On phone, the primary column becomes the card title (no label). */
  primary?: boolean;
  /** Hide this column in the stacked phone card. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Whole row is a link (Enter activates) per TableRow context. */
  onRowClick?: (row: Row) => void;
  /** Accessible table name. */
  caption: string;
  empty?: ReactNode;
  footer?: ReactNode;
  /** Highlights a row (e.g. Berulang red edge). */
  rowClassName?: (row: Row) => string | undefined;
  className?: string;
}

/**
 * DataTable + TableHeaderRow + TableRow (.pen o0MmL1, KO6rb, v0esjL). Below 900 px every row
 * becomes a stacked card (TableCard_Mobile pattern, PRD §2.2) — no horizontal scrolling.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
  empty,
  footer,
  rowClassName,
  className,
}: DataTableProps<Row>) {
  const template = columns.map((c) => (c.width ? `${c.width}px` : 'minmax(0, 1fr)')).join(' ');
  const onKey = (e: KeyboardEvent, row: Row) => {
    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onRowClick(row);
    }
  };
  return (
    <div className={['data-table', className].filter(Boolean).join(' ')}>
      <div role="table" aria-label={caption} style={{ ['--cols' as string]: template }}>
        <div role="rowgroup">
          <div role="row" className="data-table__head">
            {columns.map((c) => (
              <span
                key={c.key}
                role="columnheader"
                className={c.align === 'right' ? 'is-right' : undefined}
              >
                {c.header}
              </span>
            ))}
          </div>
        </div>
        <div role="rowgroup">
          {rows.length === 0 && empty ? (
            <div role="row" className="data-table__empty">
              <span role="cell">{empty}</span>
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={rowKey(row)}
                role="row"
                tabIndex={onRowClick ? 0 : undefined}
                className={[
                  'data-table__row',
                  onRowClick && 'data-table__row--link',
                  rowClassName?.(row),
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={(e) => onKey(e, row)}
              >
                {columns.map((c) => (
                  <span
                    key={c.key}
                    role="cell"
                    data-label={c.primary ? undefined : c.header}
                    className={
                      [
                        c.align === 'right' && 'is-right',
                        c.primary && 'is-primary',
                        c.hideOnMobile && 'is-hidden-mobile',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                  >
                    {c.render(row)}
                  </span>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      {footer && <div className="data-table__footer">{footer}</div>}
    </div>
  );
}

export interface TableCardMobileProps {
  title: ReactNode;
  pairs: { label: string; value: ReactNode; mono?: boolean }[];
  markers?: ReactNode;
  onClick?: () => void;
}

/** TableCard_Mobile (.pen t2Z0sk): standalone stacked card for custom phone lists. */
export function TableCardMobile({ title, pairs, markers, onClick }: TableCardMobileProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={['table-card', onClick && 'table-card--link'].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <span className="table-card__title">{title}</span>
      {pairs.map((p) => (
        <span key={p.label} className="table-card__pair">
          <span className="t-eyebrow">{p.label}</span>
          <span className={p.mono ? 't-mono' : undefined}>{p.value}</span>
        </span>
      ))}
      {markers && <span className="table-card__markers">{markers}</span>}
    </Tag>
  );
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

/** Pagination (.pen EDYuQ): 25 rows per page; 44 px buttons; aria-current on the current page. */
export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const visible = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pages || Math.abs(p - page) <= 1,
  );
  return (
    <nav className="pagination" aria-label="Halaman">
      <span className="pagination__range">
        Menampilkan {from}–{to} dari {total}
      </span>
      <div className="pagination__controls">
        <button
          type="button"
          className="pagination__btn"
          aria-label="Halaman sebelumnya"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft aria-hidden />
        </button>
        {visible.map((p, i) => (
          <span key={p} className="pagination__item">
            {i > 0 && p - visible[i - 1]! > 1 && <span className="pagination__gap">…</span>}
            <button
              type="button"
              className={['pagination__btn', p === page && 'is-current'].filter(Boolean).join(' ')}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          </span>
        ))}
        <button
          type="button"
          className="pagination__btn"
          aria-label="Halaman berikutnya"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight aria-hidden />
        </button>
      </div>
    </nav>
  );
}

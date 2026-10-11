import { LoaderCircle, Lock, type LucideIcon } from 'lucide-react';
import { forwardRef, useId, type ButtonHTMLAttributes } from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  loading?: boolean;
  /** Label shown while loading, e.g. "Menyimpan…". */
  loadingLabel?: string;
  fullWidth?: boolean;
}

/** Button_Primary / _Secondary / _Ghost / _Destructive (.pen UV5LT, IPBgH, aYYYS, JgRKB). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    icon: Icon,
    loading = false,
    loadingLabel = 'Menyimpan…',
    fullWidth = false,
    className,
    children,
    type = 'button',
    disabled,
    ...rest
  },
  ref,
) {
  const classes = ['btn', `btn--${variant}`, fullWidth && 'btn--full', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="btn__icon spin" aria-hidden />
      ) : (
        Icon && <Icon className="btn__icon" aria-hidden />
      )}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
});

export interface FinalizeOperatorButtonProps {
  /** The finalising action, e.g. "Terbitkan Register". */
  label: string;
  /** The Pejabat who performs it. */
  officialName: string;
}

/**
 * Button_FinalizeOperator (.pen IfFmi): the one case where a button is shown disabled (PRD §2.4).
 * Operators see the finalising action locked with "Dilakukan oleh [Nama Pejabat]" beneath.
 */
export function FinalizeOperatorButton({ label, officialName }: FinalizeOperatorButtonProps) {
  const captionId = useId();
  return (
    <div className="btn-finalize">
      <button
        type="button"
        className="btn btn--locked"
        aria-disabled="true"
        aria-describedby={captionId}
      >
        <Lock className="btn__icon" aria-hidden />
        <span>{label}</span>
      </button>
      <span id={captionId} className="btn-finalize__caption">
        Dilakukan oleh {officialName}
      </span>
    </div>
  );
}

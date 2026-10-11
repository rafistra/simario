import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import './Form.css';

export interface FieldProps {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Receives the ids the control must use for labelling and descriptions. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Shared label / helper / error frame for TextInput, Textarea, Select, DatePickerField. */
export function Field({ label, helper, error, required, className, children }: FieldProps) {
  const id = useId();
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['field', error && 'field--error', className].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {helper && (
        <span id={helperId} className="field__helper">
          {helper}
        </span>
      )}
      {error && (
        <span id={errorId} className="field__error">
          <CircleAlert aria-hidden />
          {error}
        </span>
      )}
    </div>
  );
}

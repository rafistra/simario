import { Calendar, ChevronDown, Search } from 'lucide-react';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Field } from './Field';
import './Form.css';

interface FieldChrome {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  className?: string;
}

export type TextInputProps = FieldChrome & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

/** TextInput (.pen WcOpi): label always visible, height 44, error with icon. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, helper, error, className, required, ...rest },
  ref,
) {
  return (
    <Field label={label} helper={helper} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          className="control"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          {...rest}
        />
      )}
    </Field>
  );
});

export type TextareaProps = FieldChrome &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

/** Textarea (.pen S4x4n): min height 112. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, helper, error, className, required, rows = 4, ...rest },
  ref,
) {
  return (
    <Field label={label} helper={helper} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          className="control control--textarea"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          {...rest}
        />
      )}
    </Field>
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectProps = FieldChrome &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
    options: SelectOption[];
    placeholder?: string;
  };

/** Select (.pen k6oHeS): native select styled as the control, chevron trailing icon. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, helper, error, className, required, options, placeholder, ...rest },
  ref,
) {
  return (
    <Field label={label} helper={helper} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <div className="control-wrap">
          <select
            ref={ref}
            id={id}
            className="control control--select"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            {...rest}
          >
            {placeholder !== undefined && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="control-wrap__icon" aria-hidden />
        </div>
      )}
    </Field>
  );
});

export type DatePickerFieldProps = FieldChrome &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'>;

/** DatePickerField (.pen r1ZqpH): native date input, mono value, calendar icon. */
export const DatePickerField = forwardRef<HTMLInputElement, DatePickerFieldProps>(
  function DatePickerField({ label, helper, error, className, required, ...rest }, ref) {
    return (
      <Field label={label} helper={helper} error={error} required={required} className={className}>
        {({ id, describedBy, invalid }) => (
          <div className="control-wrap">
            <input
              ref={ref}
              id={id}
              type="date"
              className="control control--date"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              required={required}
              {...rest}
            />
            <Calendar className="control-wrap__icon" aria-hidden />
          </div>
        )}
      </Field>
    );
  },
);

export interface SearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'className'
> {
  /** Accessible name; the placeholder is never the only label. */
  label: string;
  className?: string;
}

/** SearchField (.pen Depou): height 48, radius lg, magnifier icon (Aksara pattern). */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { label, className, ...rest },
  ref,
) {
  return (
    <div className={['search-field', className].filter(Boolean).join(' ')}>
      <Search className="search-field__icon" aria-hidden />
      <input ref={ref} type="search" aria-label={label} className="search-field__input" {...rest} />
    </div>
  );
});

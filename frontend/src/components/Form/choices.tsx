import { Check, Upload } from 'lucide-react';
import { useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import './Form.css';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'className'
> {
  label: ReactNode;
  className?: string;
}

/** Checkbox (.pen mnLYf): 20 px box, 44 px click row. */
export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={['checkbox', className].filter(Boolean).join(' ')}>
      <input type="checkbox" className="checkbox__input" {...rest} />
      <span className="checkbox__box" aria-hidden>
        <Check className="checkbox__check" />
      </span>
      <span className="checkbox__label">{label}</span>
    </label>
  );
}

export interface ToggleProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** Toggle (.pen OaD4x): role=switch, 36×20 track, 44 px click row. */
export function Toggle({ label, checked, onChange, disabled, className }: ToggleProps) {
  const id = useId();
  return (
    <div className={['toggle', className].filter(Boolean).join(' ')}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className="toggle__track"
        onClick={() => onChange(!checked)}
      >
        <span className="toggle__knob" />
      </button>
      <label htmlFor={id} className="toggle__label">
        {label}
      </label>
    </div>
  );
}

export interface FileDropProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  title?: string;
  caption?: string;
  disabled?: boolean;
}

/** FileDrop (.pen nqpWu): drag-and-drop or click; formats and limits per NFR-009. */
export function FileDrop({
  onFiles,
  accept = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.mp4',
  multiple = true,
  title = 'Seret berkas ke sini atau pilih berkas',
  caption = 'PDF, DOCX, XLSX, PNG, JPG, MP4 · maks. 20 MB · 10 berkas',
  disabled,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={['file-drop', dragging && 'file-drop--active'].filter(Boolean).join(' ')}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Unggah lampiran"
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <span className="file-drop__icon" aria-hidden>
        <Upload />
      </span>
      <span className="file-drop__title">{title}</span>
      <span className="file-drop__caption">{caption}</span>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </div>
  );
}

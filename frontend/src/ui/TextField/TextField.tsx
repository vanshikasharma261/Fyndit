import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import styles from "./TextField.module.css";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Field label rendered above the input. */
  label: string;
  /** Validation message; renders in error styling and marks the input invalid. */
  error?: string;
}

/**
 * Labelled text input with an accent focus ring and inline error state. The base
 * form control for checkout, profile, address, and auth forms.
 */
function TextField({ label, error, className, ...rest }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`${styles.input} ${error ? styles.invalid : ""} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error && (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}

export default TextField;

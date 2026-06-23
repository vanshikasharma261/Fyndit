import type { SelectHTMLAttributes } from "react";
import { useId } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./SelectField.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  /** Field label rendered above the control. */
  label: string;
  /** Options to render. */
  options: SelectOption[];
  /** Placeholder shown as a disabled first option when there's no value. */
  placeholder?: string;
  /** Validation message; renders in error styling. */
  error?: string;
}

/**
 * Labelled dropdown matching `TextField`'s styling, with a custom chevron and
 * the same accent focus ring. Used for state/country/address-type selects.
 */
function SelectField({
  label,
  options,
  placeholder,
  error,
  className,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>
        <select
          id={id}
          className={`${styles.select} ${error ? styles.invalid : ""} ${className ?? ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </div>
      {error && (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}

export default SelectField;

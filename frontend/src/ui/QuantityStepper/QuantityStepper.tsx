import { Minus, Plus } from "lucide-react";
import styles from "./QuantityStepper.module.css";

export interface QuantityStepperProps {
  /** Current quantity. */
  value: number;
  /** Minimum allowed value. Defaults to 1. */
  min?: number;
  /** Maximum allowed value (e.g. available stock). */
  max?: number;
  /** Disables both controls. */
  disabled?: boolean;
  /** Fired with the next quantity when incremented/decremented. */
  onChange: (next: number) => void;
}

/**
 * Compact +/- quantity control used on cart line items. Clamps to `min`/`max`
 * and disables the relevant button at the bounds.
 */
function QuantityStepper({
  value,
  min = 1,
  max,
  disabled = false,
  onChange,
}: QuantityStepperProps) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(value - 1)}
        disabled={disabled || atMin}
        aria-label="Decrease quantity"
      >
        <Minus size={16} />
      </button>
      <span className={styles.quantity}>{value}</span>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(value + 1)}
        disabled={disabled || atMax}
        aria-label="Increase quantity"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

export default QuantityStepper;

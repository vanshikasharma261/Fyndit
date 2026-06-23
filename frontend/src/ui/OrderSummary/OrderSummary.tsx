import type { ReactNode } from "react";
import styles from "./OrderSummary.module.css";

export interface SummaryRow {
  label: string;
  value: string;
  /** Render the value in success-green (e.g. discounts/savings). */
  positive?: boolean;
}

export interface OrderSummaryProps {
  /** Optional heading (e.g. "ORDER SUMMARY"). */
  title?: string;
  /** Line items above the total. */
  rows: SummaryRow[];
  /** Total label. Defaults to "Total". */
  totalLabel?: string;
  /** Total value, shown emphasized below a divider. */
  total: string;
  /** Optional savings callout below the total. */
  savings?: ReactNode;
}

/**
 * Totals breakdown card body — subtotal, discount, shipping, and an emphasized
 * total with an optional savings callout. Used in the cart and checkout summary.
 */
function OrderSummary({
  title,
  rows,
  totalLabel = "Total",
  total,
  savings,
}: OrderSummaryProps) {
  return (
    <div className={styles.summary}>
      {title && <h2 className={styles.heading}>{title}</h2>}

      {rows.map((row) => (
        <div key={row.label} className={styles.row}>
          <span>{row.label}</span>
          <span className={row.positive ? styles.positive : ""}>{row.value}</span>
        </div>
      ))}

      <div className={`${styles.row} ${styles.total}`}>
        <span>{totalLabel}</span>
        <span>{total}</span>
      </div>

      {savings && <div className={styles.savings}>{savings}</div>}
    </div>
  );
}

export default OrderSummary;

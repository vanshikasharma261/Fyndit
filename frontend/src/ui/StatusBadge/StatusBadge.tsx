import styles from "./StatusBadge.module.css";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export interface StatusBadgeProps {
  /** Order lifecycle status; drives the pill color. */
  status: OrderStatus;
  /** Override the displayed text. Defaults to a title-cased status. */
  label?: string;
}

const TONE_CLASS: Record<OrderStatus, string> = {
  PENDING: styles.pending,
  CONFIRMED: styles.confirmed,
  PACKED: styles.confirmed,
  SHIPPED: styles.shipped,
  DELIVERED: styles.shipped,
  CANCELLED: styles.cancelled,
};

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/**
 * Order-status pill matching the order history / order detail screens. Pending
 * is accent, Confirmed/Packed are primary-tinted, Shipped/Delivered are success,
 * Cancelled is error.
 */
function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`${styles.pill} ${TONE_CLASS[status]}`}>
      {label ?? titleCase(status)}
    </span>
  );
}

export default StatusBadge;

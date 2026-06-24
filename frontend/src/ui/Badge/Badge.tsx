import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "accent" | "primary" | "success" | "error" | "neutral";

export interface BadgeProps {
  /** Color tone of the pill. `accent` is the discount-badge look. */
  tone?: BadgeTone;
  children: ReactNode;
}

/**
 * Small rounded pill for short labels — discount percentages, "Default" markers,
 * category tags. Use `StatusBadge` for order-status pills.
 */
function Badge({ tone = "accent", children }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
  );
}

export default Badge;

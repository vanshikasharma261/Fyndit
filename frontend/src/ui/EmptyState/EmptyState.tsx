import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  /** Optional illustration or icon shown above the title. */
  art?: ReactNode;
  /** Headline message (e.g. "Your cart is empty"). */
  title: string;
  /** Optional supporting line under the title. */
  description?: string;
  /** Optional call-to-action (e.g. a Button or link). */
  action?: ReactNode;
}

/**
 * Centered empty-state block for empty cart / no orders / no results screens.
 */
function EmptyState({ art, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {art && <div className={styles.art}>{art}</div>}
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export default EmptyState;

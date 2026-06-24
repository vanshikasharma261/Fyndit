import { Check, X } from "lucide-react";
import styles from "./Timeline.module.css";

export type TimelineStepState =
  | "complete"
  | "current"
  | "upcoming"
  | "cancelled";

export interface TimelineStep {
  /** Stable key; falls back to `label`. */
  id?: string;
  label: string;
  /** Optional sub-line under the label (e.g. a date). */
  caption?: string;
  state: TimelineStepState;
}

export interface TimelineProps {
  /** Ordered steps, each carrying its own already-resolved state. */
  steps: TimelineStep[];
  /** Accessible name for the whole track. */
  ariaLabel?: string;
}

const STATE_CLASS: Record<TimelineStepState, string> = {
  complete: styles.complete,
  current: styles.current,
  upcoming: styles.upcoming,
  cancelled: styles.cancelled,
};

function Timeline({ steps, ariaLabel = "Progress" }: TimelineProps) {
  const lastIndex = steps.length - 1;

  return (
    <ol className={styles.track} aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const incomingDone = step.state === "complete";
        const outgoingDone = index < lastIndex && step.state === "complete";

        return (
          <li
            key={step.id ?? step.label}
            className={`${styles.step} ${STATE_CLASS[step.state]}`}
            aria-current={step.state === "current" ? "step" : undefined}
          >
            <div className={styles.node}>
              <span
                className={`${styles.connector} ${index === 0 ? styles.connectorHidden : ""} ${incomingDone ? styles.connectorDone : ""}`}
                aria-hidden="true"
              />
              <span className={styles.dot}>
                {step.state === "complete" && (
                  <Check className={styles.icon} aria-hidden="true" />
                )}
                {step.state === "cancelled" && (
                  <X className={styles.icon} aria-hidden="true" />
                )}
                {step.state === "current" && (
                  <span className={styles.inner} aria-hidden="true" />
                )}
              </span>
              <span
                className={`${styles.connector} ${index === lastIndex ? styles.connectorHidden : ""} ${outgoingDone ? styles.connectorDone : ""}`}
                aria-hidden="true"
              />
            </div>
            <span className={styles.label}>{step.label}</span>
            {step.caption ? (
              <span className={styles.caption}>{step.caption}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default Timeline;

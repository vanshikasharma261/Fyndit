import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `soft` adds the elevation shadow; `flat` keeps only the border. */
  elevation?: "soft" | "flat";
  /** Inner padding step. Defaults to `5`. */
  padding?: "4" | "5" | "6";
  children: ReactNode;
}

/**
 * The base surface container — white background, soft border, rounded corners.
 * Summary cards, panels, and item cards across the app are built on this.
 */
function Card({
  elevation = "soft",
  padding = "5",
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    elevation === "soft" ? styles.soft : "",
    styles[`p${padding}`],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export default Card;

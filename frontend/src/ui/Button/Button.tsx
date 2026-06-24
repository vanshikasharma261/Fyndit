import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `primary` is the accent CTA used for the main action. */
  variant?: ButtonVariant;
  /** Control height/padding. Defaults to `md`. */
  size?: ButtonSize;
  /** Stretch to the full width of the container. */
  fullWidth?: boolean;
  /** Optional leading icon (e.g. a lucide-react icon element). */
  leadingIcon?: ReactNode;
  children: ReactNode;
}

/**
 * The single button primitive for Fyndit. `primary` is the accent-filled CTA
 * (Proceed to Checkout, Confirm & Pay), `secondary` the bordered neutral action
 * (View order), `danger` the destructive action (Cancel order), and `ghost` the
 * borderless text action (Clear filters, Remove).
 */
function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  leadingIcon,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {leadingIcon && <span className={styles.icon}>{leadingIcon}</span>}
      {children}
    </button>
  );
}

export default Button;

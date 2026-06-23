import { ArrowDown } from "lucide-react";
import styles from "./PriceTag.module.css";

export interface PriceTagProps {
  /** The price the customer pays. */
  price: number;
  /** Original pre-discount price. When higher than `price`, shows a strike + % off. */
  compareAt?: number;
  /** Currency symbol prefix. Defaults to `$`. */
  currency?: string;
  /** Larger price text for product detail / cart line items. */
  size?: "md" | "lg";
}

function format(value: number, currency: string): string {
  return `${currency}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Price display with optional discount. Shows the final price, the struck-through
 * original, and a green down-arrow percentage when `compareAt` exceeds `price`
 * (matches the cart / product card discount treatment).
 */
function PriceTag({ price, compareAt, currency = "$", size = "md" }: PriceTagProps) {
  const discounted = compareAt !== undefined && compareAt > price;
  const percentOff = discounted
    ? Math.round(((compareAt - price) / compareAt) * 100)
    : 0;

  return (
    <span className={styles.row}>
      <span className={`${styles.price} ${size === "lg" ? styles.lg : ""}`}>
        {format(price, currency)}
      </span>
      {discounted && (
        <>
          <span className={styles.strike}>{format(compareAt, currency)}</span>
          <span className={styles.discount}>
            <ArrowDown size={14} aria-hidden="true" />
            {percentOff}%
          </span>
        </>
      )}
    </span>
  );
}

export default PriceTag;

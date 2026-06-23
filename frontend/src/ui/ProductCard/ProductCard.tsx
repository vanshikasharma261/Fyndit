import PriceTag from "../PriceTag/PriceTag";
import styles from "./ProductCard.module.css";

export interface ProductCardProps {
  /** Product title. */
  name: string;
  /** Brand / vendor line under the title. */
  brand?: string;
  /** Short description, clamped to two lines. */
  description?: string;
  /** Resolved image URL. When omitted, a gradient placeholder shows. */
  imageUrl?: string;
  /** Current price. */
  price: number;
  /** Original price; when higher than `price`, a discount is shown. */
  compareAt?: number;
  /** Currency symbol prefix passed to the price. Defaults to `$`. */
  currency?: string;
  /** Fired when the card is activated. */
  onSelect?: () => void;
}

/**
 * The product tile used across the homepage sections and the products grid.
 * Square image, title/brand/description, and a price row pinned to the bottom so
 * prices align across a grid of cards. Renders as a button for full-card click.
 */
function ProductCard({
  name,
  brand,
  description,
  imageUrl,
  price,
  compareAt,
  currency = "$",
  onSelect,
}: ProductCardProps) {
  return (
    <button type="button" className={styles.card} onClick={onSelect}>
      <div className={styles.imageWrap}>
        {imageUrl ? (
          <img src={imageUrl} alt={name} className={styles.image} loading="lazy" />
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{name}</h3>
        {brand && <p className={styles.brand}>{brand}</p>}
        {description && <p className={styles.description}>{description}</p>}

        <div className={styles.priceRow}>
          <PriceTag price={price} compareAt={compareAt} currency={currency} />
        </div>
      </div>
    </button>
  );
}

export default ProductCard;

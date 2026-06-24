import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./FilterSidebar.module.css";

export interface AttributeFacet {
  /** Stable key used in callbacks. */
  name: string;
  /** Human label shown as the group heading. */
  label: string;
  /** Selectable values. */
  values: string[];
}

export interface ProductFilters {
  price: { min: number; max: number };
  attributes: AttributeFacet[];
}

export interface FilterSidebarProps {
  filters: ProductFilters | null;
  loading?: boolean;
  /** Currently selected attribute values, keyed by facet name. */
  selectedAttributes: Record<string, string[]>;
  /** Selected max price (undefined → the facet maximum, i.e. no cap). */
  selectedMaxPrice?: number;
  /** Currency symbol prefix for the price labels. Defaults to `$`. */
  currency?: string;
  /** Sets the price cap (the lower bound stays at the facet minimum). */
  onMaxPriceChange: (max: number) => void;
  onToggleAttribute: (key: string, value: string) => void;
  onClear: () => void;
}

/** Px slack so a near-bottom resting position still counts as "at the bottom". */
const SCROLL_BOTTOM_SLACK = 4;

function formatPrice(value: number, currency: string): string {
  return `${currency}${value.toLocaleString()}`;
}

/**
 * Data-driven filter sidebar: a price slider plus one toggleable pill group per
 * attribute facet. Sticky on desktop with an internal scroll and a fading
 * down-chevron hint when there's more content below.
 */
function FilterSidebar({
  filters,
  loading = false,
  selectedAttributes,
  selectedMaxPrice,
  currency = "$",
  onMaxPriceChange,
  onToggleAttribute,
  onClear,
}: FilterSidebarProps) {
  const minBound = filters ? Math.floor(filters.price.min) : 0;
  const maxBound = filters ? Math.ceil(filters.price.max) : 0;
  const currentMax = selectedMaxPrice ?? maxBound;

  const hasActiveFilters =
    Object.keys(selectedAttributes).length > 0 || selectedMaxPrice !== undefined;

  const hasPriceRange = maxBound > minBound;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      setCanScrollDown(remaining > SCROLL_BOTTOM_SLACK);
    };

    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [filters, loading]);

  return (
    <aside className={styles.sidebar} aria-label="Product filters">
      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.header}>
          <h2 className={styles.title}>Filters</h2>
          {hasActiveFilters && (
            <button type="button" className={styles.clear} onClick={onClear}>
              Clear filters
            </button>
          )}
        </div>

        {loading && !filters ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
          <>
            {hasPriceRange && (
              <section className={styles.group}>
                <h3 className={styles.groupTitle}>Price Range</h3>
                <div className={styles.priceLabels}>
                  <span>{formatPrice(minBound, currency)}</span>
                  <span className={styles.priceMax}>
                    {formatPrice(currentMax, currency)}
                  </span>
                </div>
                <input
                  type="range"
                  className={styles.slider}
                  min={minBound}
                  max={maxBound}
                  value={currentMax}
                  onChange={(event) => onMaxPriceChange(Number(event.target.value))}
                  aria-label="Maximum price"
                />
              </section>
            )}

            {filters?.attributes.map((facet) => (
              <section key={facet.name} className={styles.group}>
                <h3 className={styles.groupTitle}>{facet.label}</h3>
                <div className={styles.pills}>
                  {facet.values.map((value) => {
                    const selected =
                      selectedAttributes[facet.name]?.includes(value) ?? false;
                    return (
                      <button
                        key={value}
                        type="button"
                        className={`${styles.pill} ${selected ? styles.pillSelected : ""}`}
                        aria-pressed={selected}
                        onClick={() => onToggleAttribute(facet.name, value)}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {canScrollDown && (
        <div className={styles.scrollHint} aria-hidden="true">
          <ChevronDown size={18} className={styles.scrollHintIcon} />
        </div>
      )}
    </aside>
  );
}

export default FilterSidebar;

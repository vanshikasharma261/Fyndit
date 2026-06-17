import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ProductFiltersResponse } from "../../types/product.types";
import { ProductMessages } from "../../constants/messages.constant";
import { formatPrice } from "../../utils/format";
import styles from "./FilterSidebar.module.css";

interface FilterSidebarProps {
  filters: ProductFiltersResponse | null;
  loading: boolean;
  /** Currently selected attribute values from the URL. */
  selectedAttributes: Record<string, string[]>;
  /** Selected max price (undefined → the facet maximum, i.e. no cap). */
  selectedMaxPrice?: number;
  /** Sets the price cap (the lower bound stays at the facet minimum). */
  onMaxPriceChange: (max: number) => void;
  onToggleAttribute: (key: string, value: string) => void;
  onClear: () => void;
}

/** Px slack so a near-bottom resting position still counts as "at the bottom". */
const SCROLL_BOTTOM_SLACK = 4;

/**
 * Data-driven filter sidebar: a price slider plus one toggleable group per
 * `AttributeFacet` returned for the current category scope. The `All` scope
 * returns no attribute facets, so only the price group shows.
 *
 * In tall scopes (e.g. Electronics) the filter list exceeds the pinned panel
 * height and scrolls internally. A bouncing down-chevron hint fades in while
 * there is more content below and disappears once the user reaches the bottom,
 * so the hidden-until-hover scrollbar isn't the only cue that more exists.
 */
function FilterSidebar({
  filters,
  loading,
  selectedAttributes,
  selectedMaxPrice,
  onMaxPriceChange,
  onToggleAttribute,
  onClear,
}: FilterSidebarProps) {
  const minBound = filters ? Math.floor(Number(filters.price.min)) : 0;
  const maxBound = filters ? Math.ceil(Number(filters.price.max)) : 0;
  const currentMax = selectedMaxPrice ?? maxBound;

  const hasActiveFilters =
    Object.keys(selectedAttributes).length > 0 ||
    selectedMaxPrice !== undefined;

  const hasPriceRange = maxBound > minBound;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  // Track whether the scroll area has more content below the fold. Recomputed
  // on scroll, on viewport resize (max-height changes), and whenever the facet
  // content changes (effect deps) — never set synchronously in the effect body,
  // so it stays clear of the set-state-in-effect rule.
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
              {ProductMessages.clearFilters}
            </button>
          )}
        </div>

        {loading && !filters ? (
          <p className={styles.loading}>{ProductMessages.loading}</p>
        ) : (
          <>
            {/* ----- Price range ----- */}
            {hasPriceRange && (
              <section className={styles.group}>
                <h3 className={styles.groupTitle}>Price Range</h3>
                <div className={styles.priceLabels}>
                  <span>{formatPrice(minBound)}</span>
                  <span className={styles.priceMax}>
                    {formatPrice(currentMax)}
                  </span>
                </div>
                <input
                  type="range"
                  className={styles.slider}
                  min={minBound}
                  max={maxBound}
                  value={currentMax}
                  onChange={(event) =>
                    onMaxPriceChange(Number(event.target.value))
                  }
                  aria-label="Maximum price"
                />
              </section>
            )}

            {/* ----- Attribute facets ----- */}
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

      {/* "More below" affordance — purely decorative, clicks pass through. */}
      {canScrollDown && (
        <div className={styles.scrollHint} aria-hidden="true">
          <ChevronDown size={18} className={styles.scrollHintIcon} />
        </div>
      )}
    </aside>
  );
}

export default FilterSidebar;

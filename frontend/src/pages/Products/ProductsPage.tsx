import { useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  fetchFilters,
  fetchProducts,
} from "../../features/products/productsSlice";
import FilterSidebar from "../../components/FilterSidebar/FilterSidebar";
import Pagination from "../../components/Pagination/Pagination";
import NoResults from "../../components/NoResults";
import { ProductMessages } from "../../constants/messages.constant";
import { formatDiscountBadge, formatPrice } from "../../utils/format";
import { resolveImageUrl } from "../../utils/image";
import { parseAttributes, parseNumber } from "../../utils/url";
import type { ProductListItem } from "../../types/product.types";
import styles from "./Products.module.css";

function ProductsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { category = "All" } = useParams<{ category: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") ?? undefined;
  const page = parseNumber(searchParams.get("page")) ?? 1;
  const minPrice = parseNumber(searchParams.get("minPrice"));
  const maxPrice = parseNumber(searchParams.get("maxPrice"));
  const attributesRaw = searchParams.get("attributes");
  const attributes = useMemo(
    () => parseAttributes(attributesRaw),
    [attributesRaw],
  );

  const { items, meta, listLoading, listError, filters, filtersLoading } =
    useAppSelector((state) => state.products);

  // The URL is the source of truth: any change re-drives the listing fetch.
  useEffect(() => {
    dispatch(
      fetchProducts({ category, search, page, minPrice, maxPrice, attributes }),
    );
  }, [dispatch, category, search, page, minPrice, maxPrice, attributes]);

  // Facets are intentionally stable while narrowing — refetch on scope/search
  // change only, never on a filter toggle.
  useEffect(() => {
    dispatch(fetchFilters({ category, search }));
  }, [dispatch, category, search]);

  /** Apply a query-string mutation; filter changes reset the page to 1. */
  const updateParams = (
    mutate: (params: URLSearchParams) => void,
    resetPage = true,
  ) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    if (resetPage) next.delete("page");
    setSearchParams(next);
  };

  const handleMaxPriceChange = (max: number) => {
    updateParams((params) => {
      const maxBound = filters ? Math.ceil(Number(filters.price.max)) : undefined;
      if (maxBound !== undefined && max >= maxBound) {
        params.delete("maxPrice");
      } else {
        params.set("maxPrice", String(max));
      }
    });
  };

  const handleToggleAttribute = (key: string, value: string) => {
    updateParams((params) => {
      const nextMap: Record<string, string[]> = { ...attributes };
      const current = nextMap[key] ?? [];
      const updated = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];

      if (updated.length > 0) nextMap[key] = updated;
      else delete nextMap[key];

      if (Object.keys(nextMap).length > 0) {
        params.set("attributes", JSON.stringify(nextMap));
      } else {
        params.delete("attributes");
      }
    });
  };

  const handleClearFilters = () => {
    updateParams((params) => {
      params.delete("minPrice");
      params.delete("maxPrice");
      params.delete("attributes");
    });
  };

  const handlePageChange = (nextPage: number) => {
    updateParams((params) => {
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));
    }, false);
  };

  return (
    <div className={styles.page}>
      <FilterSidebar
        filters={filters}
        loading={filtersLoading}
        selectedAttributes={attributes}
        selectedMaxPrice={maxPrice}
        onMaxPriceChange={handleMaxPriceChange}
        onToggleAttribute={handleToggleAttribute}
        onClear={handleClearFilters}
      />

      <main className={styles.main}>
        <h1 className={styles.heading}>Products</h1>

        {listLoading && (
          <p className={styles.status}>{ProductMessages.loading}</p>
        )}

        {!listLoading && listError && (
          <p className={`${styles.status} ${styles.error}`}>{listError}</p>
        )}

        {!listLoading && !listError && items.length === 0 && (
          <NoResults searchQuery={search} />
        )}

        {!listLoading && !listError && items.length > 0 && (
          <>
            <div className={styles.grid}>
              {items.map((item) => (
                <ProductCard
                  key={item.product_id}
                  item={item}
                  onSelect={() => navigate(`/product/detail/${item.slug}`)}
                />
              ))}
            </div>

            {meta && (
              <Pagination
                pageCount={meta.total_pages}
                currentPage={meta.page}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

interface ProductCardProps {
  item: ProductListItem;
  onSelect: () => void;
}

function ProductCard({ item, onSelect }: ProductCardProps) {
  const imageUrl = resolveImageUrl(item.image_url);
  const badge = formatDiscountBadge(item.price, item.discount);

  return (
    <button type="button" className={styles.card} onClick={onSelect}>
      <div className={styles.imageWrap}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.product_name}
            className={styles.image}
            loading="lazy"
          />
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.cardBody}>
        <h3 className={styles.cardName}>{item.product_name}</h3>
        <p className={styles.cardBrand}>{item.brand}</p>
        <p className={styles.cardDescription}>{item.description}</p>

        <div className={styles.cardPriceRow}>
          <span className={styles.cardPrice}>{formatPrice(item.price)}</span>
          {badge && <span className={styles.cardBadge}>{badge}</span>}
        </div>
      </div>
    </button>
  );
}

export default ProductsPage;

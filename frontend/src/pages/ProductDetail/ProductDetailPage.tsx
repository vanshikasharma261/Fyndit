import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  clearProductDetail,
  fetchProductDetail,
} from "../../features/products/productsSlice";
import { toast } from "react-toastify";
import { addToCart } from "../../features/cart/cartSlice";
import { resolveImageUrl } from "../../utils/image";
import { CartMessages, ProductMessages } from "../../constants/messages.constant";
import { formatDiscountBadge, formatPrice, titleCase } from "../../utils/format";
import type { ProductVariantDetail } from "../../types/product.types";
import type { CartErrorResponse } from "../../types/cart.types";
import styles from "./ProductDetail.module.css";

/** Does a variant satisfy every currently selected attribute value? */
function matchesSelection(
  variant: ProductVariantDetail,
  selected: Record<string, string>,
): boolean {
  return Object.entries(selected).every(
    ([key, value]) => variant.attributes[key] === value,
  );
}

function ProductDetailPage() {
  const dispatch = useAppDispatch();
  const { slug = "" } = useParams<{ slug: string }>();

  const { detail, detailLoading, detailError } = useAppSelector(
    (state) => state.products,
  );
  const adding = useAppSelector((state) => state.cart.adding);

  const [selected, setSelected] = useState<Record<string, string>>({});
  const [imageIndex, setImageIndex] = useState(0);
  const [loadedProductId, setLoadedProductId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchProductDetail(slug));
    return () => {
      dispatch(clearProductDetail());
    };
  }, [dispatch, slug]);

  // Default to the first variant whenever a new product loads. Done during
  // render (not in an effect) per the React "adjust state on prop change"
  // pattern, so the first paint already reflects the default variant.
  if (detail && detail.variants.length > 0 && detail.product_id !== loadedProductId) {
    setLoadedProductId(detail.product_id);
    setSelected(detail.variants[0].attributes);
    setImageIndex(0);
  }

  // Distinct attribute selector groups, derived from the variants (not hardcoded).
  const groups = useMemo(() => {
    if (!detail) return [];
    const valuesByKey = new Map<string, string[]>();
    for (const variant of detail.variants) {
      for (const [key, value] of Object.entries(variant.attributes)) {
        const values = valuesByKey.get(key) ?? [];
        if (!values.includes(value)) values.push(value);
        valuesByKey.set(key, values);
      }
    }
    return [...valuesByKey.entries()].map(([name, values]) => ({
      name,
      label: titleCase(name),
      values,
    }));
  }, [detail]);

  const selectedVariant = useMemo(() => {
    if (!detail || detail.variants.length === 0) return null;
    return (
      detail.variants.find((variant) => matchesSelection(variant, selected)) ??
      detail.variants[0]
    );
  }, [detail, selected]);

  const handleSelectAttribute = (key: string, value: string) => {
    if (!detail) return;
    const next = { ...selected, [key]: value };
    const exact = detail.variants.find((variant) =>
      matchesSelection(variant, next),
    );
    if (exact) {
      setSelected(next);
    } else {
      // Snap to a valid variant carrying the chosen value.
      const fallback = detail.variants.find(
        (variant) => variant.attributes[key] === value,
      );
      if (fallback) setSelected(fallback.attributes);
    }
    setImageIndex(0);
  };

  const handleAddToCart = async () => {
    if (!selectedVariant) return;
    try {
      // The server validates stock/availability; a green toast on success, a
      // red toast with the server message on failure (out of stock, etc.).
      await dispatch(addToCart(selectedVariant.product_variant_id)).unwrap();
      toast.success(CartMessages.addSuccess);
    } catch (rejected) {
      const payload = rejected as CartErrorResponse | undefined;
      toast.error(payload?.message ?? CartMessages.genericError);
    }
  };

  if (detailLoading) {
    return <p className={styles.status}>{ProductMessages.loading}</p>;
  }

  if (detailError || !detail || !selectedVariant) {
    return (
      <p className={`${styles.status} ${styles.error}`}>
        {detailError ?? ProductMessages.detailNotFound}
      </p>
    );
  }

  const images = selectedVariant.images;
  const mainImage = resolveImageUrl(
    (images[imageIndex] ?? images[0])?.image_url ?? null,
  );
  const badge = formatDiscountBadge(
    selectedVariant.price,
    selectedVariant.discount,
  );
  const inStock = selectedVariant.stock > 0;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* ----- Gallery ----- */}
        <div className={styles.gallery}>
          {images.length > 1 && (
            <div className={styles.thumbs}>
              {images.map((image, index) => {
                const thumbUrl = resolveImageUrl(image.image_url);
                const active = index === imageIndex;
                return (
                  <button
                    key={image.image_url}
                    type="button"
                    className={`${styles.thumb} ${active ? styles.thumbActive : ""}`}
                    onClick={() => setImageIndex(index)}
                    aria-label={`View image ${index + 1}`}
                  >
                    {thumbUrl && (
                      <img
                        src={thumbUrl}
                        alt={image.alt_text ?? detail.product_name}
                        className={styles.thumbImage}
                        loading="lazy"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className={styles.mainImageWrap}>
            {mainImage ? (
              <img
                src={mainImage}
                alt={detail.product_name}
                className={styles.mainImage}
              />
            ) : (
              <div className={styles.imagePlaceholder} aria-hidden="true" />
            )}
          </div>
        </div>

        {/* ----- Info ----- */}
        <div className={styles.info}>
          <span className={styles.badge}>
            {detail.category.category_name.toUpperCase()}
          </span>

          {groups.map((group) => (
            <div key={group.name} className={styles.group}>
              <span className={styles.groupLabel}>
                {group.label.toUpperCase()}
              </span>
              <div className={styles.pills}>
                {group.values.map((value) => {
                  const isSelected = selected[group.name] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`${styles.pill} ${isSelected ? styles.pillSelected : ""}`}
                      aria-pressed={isSelected}
                      onClick={() => handleSelectAttribute(group.name, value)}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <h1 className={styles.name}>{detail.product_name}</h1>
          <p className={styles.description}>
            {detail.brand} · {detail.description}
          </p>

          <div className={styles.priceRow}>
            <span className={styles.price}>
              {formatPrice(selectedVariant.price)}
            </span>
            {badge && <span className={styles.discount}>{badge}</span>}
          </div>

          <p
            className={`${styles.stock} ${inStock ? styles.inStock : styles.outOfStock}`}
          >
            {inStock ? "In Stock" : "Out of Stock"}
          </p>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.addToCart}
              disabled={adding}
              onClick={handleAddToCart}
            >
              Add to Cart
            </button>
            {/* Buy is not wired yet — clickable but inert for now. */}
            <button type="button" className={styles.buy}>
              Buy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailPage;

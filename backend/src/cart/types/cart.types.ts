/**
 * Response contracts for the Cart module.
 *
 * Money fields (`price`, `discount`, `final_price`, and every summary total) are
 * always serialized as 2-decimal **strings** (`"1023.00"`) so no
 * `Prisma.Decimal`/float ever leaks to the client. Coupons are intentionally
 * absent — they are applied later, on the checkout page.
 *
 * The cart is returned whole (no pagination): it is bounded to at most
 * `MAX_CART_ITEMS` distinct lines, so a single response stays small.
 */

export interface CartItem {
  cart_item_id: string;
  product_variant_id: string;
  product_name: string;
  brand: string;
  description: string;
  /** Preview image: the variant's primary image, else lowest `sort_order`. */
  image_url: string | null;
  /** Per-unit list price, e.g. "1100.00". */
  price: string;
  /** Per-unit flat discount amount, e.g. "77.00". */
  discount: string;
  /** Per-unit price after discount, e.g. "1023.00" = max(0, price - discount). */
  final_price: string;
  quantity: number;
  /** Current available stock — the maximum allowed quantity. */
  stock: number;
  /** Dynamic per-category attribute map, e.g. { ram: "16GB", color: "Silver" }. */
  attributes: Record<string, string>;
}

export interface CartSummary {
  /** Sum of quantities across every line (drives the navbar badge). */
  total_items: number;
  /** Σ price × qty. */
  total_price: string;
  /** Σ discount × qty. */
  total_discount: string;
  /** total_price − total_discount. */
  final_amount: string;
}

/** `GET /cart` — the summary (over all items) and the whole item list. */
export interface CartResponse {
  summary: CartSummary;
  items: CartItem[];
}

/** `POST /cart` — the single added/updated line plus the refreshed summary. */
export interface AddToCartResponse {
  item: CartItem;
  summary: CartSummary;
}

/** `PATCH /cart/:cartItemId` — a message plus the updated line and summary. */
export interface UpdateCartResponse {
  message: string;
  item: CartItem;
  summary: CartSummary;
}

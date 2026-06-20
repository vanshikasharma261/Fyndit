/**
 * Centralised, human-facing copy for the frontend. Mirrors the backend's
 * `messages.constant.ts` convention so strings live in exactly one place.
 */

export const ProductMessages = {
  networkError: "Unable to reach the server. Please check your connection.",
  genericError: "Something went wrong. Please try again.",
  emptyResults: "No products found",
  detailNotFound: "This product is no longer available.",
  loading: "Loading…",
  clearFilters: "Clear filters",
} as const;

export const CartMessages = {
  /** Heading on the populated cart page. */
  heading: "Shopping Cart",
  /** Summary panel heading. */
  priceDetails: "PRICE DETAILS",
  /** Empty-cart heading (matches `empty_cart_ui.png`). */
  empty: "Your Cart is empty",
  /** Shown while the cart is loading. */
  loading: "Loading…",
  /** Brief confirmation after a successful add-to-cart. */
  addSuccess: "Added to cart",
  /** Remove-item action label. */
  removeItem: "Remove Item",
  /** Checkout button label. */
  checkout: "CHECKOUT",
  /** Stock status labels on a cart line. */
  inStock: "In Stock",
  outOfStock: "Out of Stock",
  /** Per-line delivery note (capitalization matches cart_ui.png). */
  deliveryNote: "Item Will be delivered within 5 days.",
  /** Trust line under the price summary. */
  trust: "Safe and Secure payments. Easy returns. 100% Authentic products.",
  /** Fallback when a cart request fails without a server message. */
  genericError: "Something went wrong. Please try again.",
} as const;

export const AddressMessages = {
  /** Panel heading (shared by list + form modes). */
  heading: "Addresses",
  /** Add-address button + blank-form title. */
  addAddress: "Add Address",
  /** Shown in place of the Add button once the limit is reached. */
  limitNote: "You can save up to 5 addresses.",
  /** Empty list copy. */
  empty: "No addresses saved yet.",
  /** Shown while the list is loading. */
  loading: "Loading…",
  /** Badge on the default address card + the set-default action. */
  defaultBadge: "Default",
  setDefault: "Set as default",
  /** Address card meta labels. */
  cityLabel: "City",
  stateLabel: "State",
  zipLabel: "Zip Code",
  /** Form button labels. */
  saveAdd: "Add",
  saveUpdate: "Update",
  cancel: "Cancel",
  /** Toast copy for successful operations. */
  addSuccess: "Address added",
  updateSuccess: "Address updated",
  removeSuccess: "Address removed",
  defaultSuccess: "Default address updated",
  /** Toast copy for a 400 validation failure (per-field errors render inline). */
  validationFailed: "Validation Failed",
  /** Fallback when a non-validation request fails without a server message. */
  genericError: "Something went wrong. Please try again.",
} as const;

export const AuthGateMessages = {
  /** Shown while the initial `GET /auth/me` session check is in flight. */
  checkingSession: "Loading…",
} as const;

export const UserMessages = {
  /** Shown after a successful inline field update. */
  updateSuccess: "Profile updated successfully",
  /** Toast/banner copy for a 400 validation failure (per-field errors render inline). */
  validationFailed: "Validation Failed",
  /** Fallback when a non-validation request fails without a server message. */
  genericError: "Something went wrong. Please try again.",
  /** Shown while the profile is being loaded. */
  loading: "Loading…",
} as const;

/**
 * Shared envelope copy for when `fetch` itself throws (offline/DNS/CORS). Lives
 * on its own so any feature can build a synthetic network-error response
 * without reusing another feature's namespaced message.
 */
export const NetworkErrorMessages = {
  title: "Network Error",
  message: "Unable to reach the server. Please check your connection.",
} as const;

export const CheckoutMessages = {
  /** Page heading. */
  heading: "Checkout",
  /** Section headings (match the checkout screenshots). */
  informationBar: "INFORMATION",
  personalHeading: "PERSONAL INFORMATION",
  shippingHeading: "SHIPPING INFORMATION",
  paymentHeading: "PAYMENT",
  bagHeading: "SHOPPING BAG",
  /** Personal field labels. */
  firstName: "FIRST NAME:",
  lastName: "LAST NAME:",
  phone: "PHONE:",
  email: "EMAIL:",
  /** Shipping. */
  addAddress: "Add Address",
  addressBadge: "ADDRESS",
  noAddress: "Add a shipping address to continue.",
  /** Payment options. */
  cod: "Cash on Delivery",
  card: "Credit / Debit Card",
  /** Promo code. */
  promoPlaceholder: "Promo Code",
  apply: "Apply",
  remove: "Remove",
  /** Summary rows. */
  shippingFee: "Shipping Fee",
  discount: "Discount",
  total: "Total",
  free: "Free",
  /** Out-of-stock overlay on a bag line. */
  outOfStock: "Out of Stock",
  /** Action buttons. */
  placeOrderCod: "Pay & Place Order",
  proceedToPayment: "Proceed to Payment",
  confirmPay: "Confirm & Pay",
  /** Toasts. */
  addressAdded: "Address added",
  couponApplied: "Coupon applied",
  couponRemoved: "Coupon removed",
  orderPlaced: "Order placed successfully",
  paymentProcessing: "Payment successful — your order is being placed.",
  /** Status copy. */
  loading: "Loading…",
  emptyTitle: "Nothing to check out",
  emptyBody: "Your cart has no items available for checkout.",
  emptyCta: "Back to cart",
  /** Fallback when a request fails without a server message. */
  genericError: "Something went wrong. Please try again.",
} as const;

export const OrderMessages = {
  /** Page headings (match the order screenshots). */
  historyHeading: "Order History",
  detailHeading: "Your Order Details",
  /** History table column headers. */
  colProduct: "PRODUCT",
  colOrderId: "ORDER ID",
  colDate: "DATE",
  colTotal: "TOTAL",
  colStatus: "STATUS",
  colAttributes: "ATTRIBUTES",
  colAction: "ACTION",
  /** Row actions. */
  view: "View",
  cancel: "Cancel",
  /** Detail labels. */
  orderDate: "ORDER DATE",
  orderId: "ORDER ID",
  paymentMethod: "PAYMENT METHOD",
  status: "STATUS",
  qty: "Qty:",
  subtotal: "Subtotal",
  discount: "Discount",
  shipping: "Shipping",
  total: "Total",
  shippingTo: "Shipping To",
  cod: "Cash on Delivery",
  card: "Credit / Debit Card",
  moreItems: (count: number) => `+${count} more item${count > 1 ? "s" : ""}`,
  /** Empty state. */
  empty: "You have not placed any orders yet.",
  emptyCta: "Start shopping",
  /** Toasts. */
  cancelSuccess: "Order cancelled",
  /** Status copy. */
  loading: "Loading…",
  notFound: "Order not found.",
  /** Fallback when a request fails without a server message. */
  genericError: "Something went wrong. Please try again.",
} as const;

export const ConfigMessages = {
  missingApiUrl:
    "VITE_API_URL is not defined. Set it in frontend/.env (e.g. http://localhost:3000).",
  missingStripeKey:
    "VITE_STRIPE_PUBLISHABLE_KEY is not defined. Set it in frontend/.env.",
} as const;

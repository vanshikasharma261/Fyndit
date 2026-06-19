/**
 * CheckoutPage unit tests.
 *
 * Stripe is fully mocked:
 *   - @stripe/stripe-js  → loadStripe returns Promise<null>
 *   - @stripe/react-stripe-js → Elements/PaymentElement are stub divs;
 *     useStripe/useElements return null so StripeCardForm renders but is inert
 *   - ../../services/stripe → stripePromise = Promise<null>
 *
 * The test renders CheckoutPage with preloaded Redux state and asserts the UI
 * without ever hitting Stripe or the backend. The thunk mocks return actions
 * that the real reducer does NOT respond to (type: "noop/..."), so preloaded
 * Redux state is preserved across the component's initial useEffect calls.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { CheckoutState } from "../../features/checkout/types";
import type { AddressState } from "../../features/address/types";
import type { CheckoutSummary } from "../../types/checkout.types";
import type { AddressResponse } from "../../types/address.types";

// ---- Stripe mocks (must be defined before the component is imported) ----

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  // Elements must render its children; using a simple div wrapper is enough.
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  PaymentElement: () => <div data-testid="stripe-payment-element" />,
  useStripe: () => null,
  useElements: () => null,
}));

// The services/stripe module runs loadStripe at module-load time; mock it so
// importing CheckoutPage does not throw the missing-key guard.
vi.mock("../../services/stripe", () => ({
  stripePromise: Promise.resolve(null),
}));

// ---- Thunk mocks that return a no-op action (type not in reducer) ----
// This is critical: the mocks must NOT return an action the real reducer handles,
// because that would overwrite the preloaded state seeded for the test.
vi.mock("../../features/checkout/checkoutSlice", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../features/checkout/checkoutSlice")>();
  return {
    ...actual,
    // Return a noop action so the real reducer ignores the dispatch.
    fetchCheckoutSummary: vi.fn(() => ({ type: "noop/fetchCheckoutSummary" })),
    applyCoupon: vi.fn(() => ({
      type: "noop/applyCoupon",
      unwrap: () => Promise.resolve({}),
    })),
    removeCoupon: vi.fn(() => ({
      type: "noop/removeCoupon",
      unwrap: () => Promise.resolve({}),
    })),
    createPaymentIntent: vi.fn(() => ({
      type: "noop/createPaymentIntent",
      unwrap: () => Promise.resolve({ client_secret: "pi_test", total: "1400.00" }),
    })),
  };
});

vi.mock("../../features/address/addressSlice", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../features/address/addressSlice")>();
  return {
    ...actual,
    fetchAddresses: vi.fn(() => ({ type: "noop/fetchAddresses" })),
    clearAddressErrors: vi.fn(() => ({ type: "noop/clearAddressErrors" })),
    addAddress: vi.fn(() => ({
      type: "noop/addAddress",
      unwrap: () => Promise.resolve({ address_id: "addr-new" }),
    })),
  };
});

vi.mock("../../features/order/orderSlice", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../features/order/orderSlice")>();
  return {
    ...actual,
    placeCodOrder: vi.fn(() => ({
      type: "noop/placeCodOrder",
      unwrap: () => Promise.resolve({ order_id: "order-uuid-1" }),
    })),
  };
});

vi.mock("../../features/cart/cartSlice", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../features/cart/cartSlice")>();
  return {
    ...actual,
    fetchCart: vi.fn(() => ({ type: "noop/fetchCart" })),
  };
});

// ---- Mock react-toastify ----
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ---- Import AFTER all mocks are registered ----
import CheckoutPage from "./CheckoutPage";

// ---- Fixtures ----

const mockAddress: AddressResponse = {
  address_id: "addr-1",
  address_type: "HOME",
  line1: "123 Main St",
  line2: null,
  city: "Mumbai",
  state: "Maharashtra",
  country: "India",
  zip: "400001",
  is_default: true,
};

const mockAddress2: AddressResponse = {
  address_id: "addr-2",
  address_type: "WORK",
  line1: "456 Office Park",
  line2: "Suite 200",
  city: "Pune",
  state: "Maharashtra",
  country: "India",
  zip: "411001",
  is_default: false,
};

const mockSummary: CheckoutSummary = {
  items: [
    {
      cart_item_id: "ci-1",
      product_variant_id: "pv-1",
      product_name: "Wireless Headphones",
      brand: "SoundMax",
      image_url: null,
      attributes: { color: "Black", size: "M" },
      price: "1500.00",
      discount: "200.00",
      final_price: "1300.00",
      quantity: 1,
      stock: 5,
      out_of_stock: false,
    },
  ],
  total_items: 1,
  sub_total: "1300.00",
  coupon_discount: "0.00",
  shipping_fee: "100.00",
  total: "1400.00",
  applied_coupon: null,
  personal: {
    first_name: "Jane",
    last_name: "Doe",
    phone: "9876543210",
    email: "jane@example.com",
  },
};

const mockSummaryWithCoupon: CheckoutSummary = {
  ...mockSummary,
  coupon_discount: "130.00",
  total: "1270.00",
  applied_coupon: {
    code: "SAVE10",
    discount_type: "PERCENTAGE",
    discount_value: "10.00",
    discount_amount: "130.00",
  },
};

// Out-of-stock: total_items=0 means nothing is purchasable
const mockSummaryEmptyPurchasable: CheckoutSummary = {
  ...mockSummary,
  total_items: 0,
};

function makeCheckoutState(overrides?: Partial<CheckoutState>): CheckoutState {
  return {
    summary: mockSummary,
    loading: false,
    applyingCoupon: false,
    removingCoupon: false,
    creatingIntent: false,
    error: null,
    ...overrides,
  };
}

function makeAddressState(overrides?: Partial<AddressState>): AddressState {
  return {
    items: [mockAddress, mockAddress2],
    loading: false,
    saving: false,
    mutatingId: null,
    errors: null,
    ...overrides,
  };
}

// ---- Loading state ----

describe("CheckoutPage — loading state", () => {
  it("renders loading message when loading and no summary", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({ loading: true, summary: null }),
        address: makeAddressState(),
      },
    });

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});

// ---- Error state ----

describe("CheckoutPage — error state", () => {
  it("renders error message when error and no summary", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({
          error: "Unable to reach the server. Please check your connection.",
          summary: null,
        }),
        address: makeAddressState(),
      },
    });

    expect(
      screen.getByText("Unable to reach the server. Please check your connection."),
    ).toBeInTheDocument();
  });
});

// ---- Empty cart state ----

describe("CheckoutPage — empty cart (no purchasable items)", () => {
  it("renders 'Nothing to check out' when total_items is 0", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({ summary: mockSummaryEmptyPurchasable }),
        address: makeAddressState(),
      },
    });

    expect(screen.getByText("Nothing to check out")).toBeInTheDocument();
  });

  it("renders 'Back to cart' button in the empty state", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({ summary: mockSummaryEmptyPurchasable }),
        address: makeAddressState(),
      },
    });

    expect(
      screen.getByRole("button", { name: "Back to cart" }),
    ).toBeInTheDocument();
  });
});

// ---- Personal information panel ----

describe("CheckoutPage — personal information (read-only)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderCheckout() {
    return renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState(),
        address: makeAddressState(),
      },
    });
  }

  it("renders page heading 'Checkout'", () => {
    renderCheckout();
    expect(
      screen.getByRole("heading", { name: "Checkout", level: 1 }),
    ).toBeInTheDocument();
  });

  it("renders PERSONAL INFORMATION section heading", () => {
    renderCheckout();
    expect(screen.getByText("PERSONAL INFORMATION")).toBeInTheDocument();
  });

  it("renders first name as a read-only field", () => {
    renderCheckout();
    expect(screen.getByText("FIRST NAME:")).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
  });

  it("renders last name as a read-only field", () => {
    renderCheckout();
    expect(screen.getByText("LAST NAME:")).toBeInTheDocument();
    expect(screen.getByText("Doe")).toBeInTheDocument();
  });

  it("renders phone as a read-only field", () => {
    renderCheckout();
    expect(screen.getByText("PHONE:")).toBeInTheDocument();
    expect(screen.getByText("9876543210")).toBeInTheDocument();
  });

  it("renders email as a read-only field", () => {
    renderCheckout();
    expect(screen.getByText("EMAIL:")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  it("renders dash for phone when personal.phone is null", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({
          summary: {
            ...mockSummary,
            personal: { ...mockSummary.personal, phone: null },
          },
        }),
        address: makeAddressState(),
      },
    });

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

// ---- Address cards ----

describe("CheckoutPage — shipping address picker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderCheckout() {
    return renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState(),
        address: makeAddressState(),
      },
    });
  }

  it("renders SHIPPING INFORMATION heading", () => {
    renderCheckout();
    expect(screen.getByText("SHIPPING INFORMATION")).toBeInTheDocument();
  });

  it("renders both address cards", () => {
    renderCheckout();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("456 Office Park")).toBeInTheDocument();
  });

  it("renders address type badge on each card", () => {
    renderCheckout();
    // Badge text from component: "{address_type} ADDRESS"
    expect(screen.getByText("HOME ADDRESS")).toBeInTheDocument();
    expect(screen.getByText("WORK ADDRESS")).toBeInTheDocument();
  });

  it("marks the default address card as aria-pressed=true", () => {
    renderCheckout();
    // addr-1 is_default=true; it will be pre-selected
    const allButtons = screen.getAllByRole("button");
    const pressedButton = allButtons.find(
      (btn) => btn.getAttribute("aria-pressed") === "true",
    );
    expect(pressedButton).toBeDefined();
  });

  it("renders 'Add Address' button", () => {
    renderCheckout();
    expect(
      screen.getByRole("button", { name: "Add Address" }),
    ).toBeInTheDocument();
  });

  it("renders line2 when present on an address", () => {
    renderCheckout();
    expect(screen.getByText("Suite 200")).toBeInTheDocument();
  });

  it("renders city name in uppercase", () => {
    renderCheckout();
    expect(screen.getByText("MUMBAI")).toBeInTheDocument();
  });

  it("shows 'Add a shipping address' note when no addresses", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState(),
        address: makeAddressState({ items: [] }),
      },
    });

    expect(
      screen.getByText("Add a shipping address to continue."),
    ).toBeInTheDocument();
  });
});

// ---- Payment method radios ----

describe("CheckoutPage — payment method selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderCheckout() {
    return renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState(),
        address: makeAddressState(),
      },
    });
  }

  it("renders PAYMENT heading", () => {
    renderCheckout();
    expect(screen.getByText("PAYMENT")).toBeInTheDocument();
  });

  it("renders 'Cash on Delivery' radio option", () => {
    renderCheckout();
    expect(screen.getByText("Cash on Delivery")).toBeInTheDocument();
  });

  it("renders 'Credit / Debit Card' radio option", () => {
    renderCheckout();
    expect(screen.getByText("Credit / Debit Card")).toBeInTheDocument();
  });

  it("COD radio is checked by default", () => {
    renderCheckout();
    const radios = screen.getAllByRole("radio");
    const codRadio = radios[0]; // COD is first in the markup
    expect(codRadio).toBeChecked();
  });

  it("Card radio is unchecked by default", () => {
    renderCheckout();
    const radios = screen.getAllByRole("radio");
    const cardRadio = radios[1]; // Card is second
    expect(cardRadio).not.toBeChecked();
  });
});

// ---- Shopping bag ----

describe("CheckoutPage — shopping bag", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderCheckout(overrideSummary?: CheckoutSummary) {
    return renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({ summary: overrideSummary ?? mockSummary }),
        address: makeAddressState(),
      },
    });
  }

  it("renders SHOPPING BAG heading", () => {
    renderCheckout();
    expect(screen.getByText("SHOPPING BAG")).toBeInTheDocument();
  });

  it("renders bag item product name", () => {
    renderCheckout();
    expect(screen.getByText("Wireless Headphones")).toBeInTheDocument();
  });

  it("renders bag item brand", () => {
    renderCheckout();
    expect(screen.getByText("SoundMax")).toBeInTheDocument();
  });

  it("renders bag item final_price formatted with formatMoney", () => {
    renderCheckout();
    // formatMoney("1300.00") = "₹1,300.00"
    expect(screen.getByText("₹1,300.00")).toBeInTheDocument();
  });

  it("renders shipping fee total row", () => {
    renderCheckout();
    expect(screen.getByText("Shipping Fee")).toBeInTheDocument();
    // shipping_fee = "100.00" → "₹100.00"
    expect(screen.getByText("₹100.00")).toBeInTheDocument();
  });

  it("renders 'Free' when shipping_fee is 0", () => {
    renderCheckout({
      ...mockSummary,
      shipping_fee: "0.00",
      total: "1300.00",
    });

    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it("renders total row with formatted total", () => {
    renderCheckout();
    expect(screen.getByText("Total")).toBeInTheDocument();
    // total = "1400.00" → "₹1,400.00"
    expect(screen.getByText("₹1,400.00")).toBeInTheDocument();
  });

  it("does NOT render discount row when coupon_discount is 0", () => {
    renderCheckout();
    expect(screen.queryByText("Discount")).not.toBeInTheDocument();
  });

  it("renders discount row when coupon is applied", () => {
    renderCheckout(mockSummaryWithCoupon);
    expect(screen.getByText("Discount")).toBeInTheDocument();
    // coupon_discount = "130.00" → "−₹130.00"
    expect(screen.getByText(/−₹130\.00/)).toBeInTheDocument();
  });

  it("renders out-of-stock overlay on bag item when out_of_stock=true", () => {
    // total_items must be > 0 to stay on the main checkout view
    renderCheckout({
      ...mockSummary,
      total_items: 1,
      items: [{ ...mockSummary.items[0], out_of_stock: true, stock: 0 }],
    });

    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
  });

  it("shows quantity multiplier when item quantity > 1", () => {
    renderCheckout({
      ...mockSummary,
      items: [{ ...mockSummary.items[0], quantity: 3 }],
    });

    expect(screen.getByText(/× 3/)).toBeInTheDocument();
  });
});

// ---- Coupon UI ----

describe("CheckoutPage — coupon apply/remove UI", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders promo code input when no coupon is applied", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({ summary: mockSummary }),
        address: makeAddressState(),
      },
    });

    expect(
      screen.getByPlaceholderText("Promo Code"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply" }),
    ).toBeInTheDocument();
  });

  it("renders applied coupon code and remove button when coupon is applied", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({ summary: mockSummaryWithCoupon }),
        address: makeAddressState(),
      },
    });

    expect(screen.getByText("SAVE10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("Apply button is disabled when coupon input is empty", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({ summary: mockSummary }),
        address: makeAddressState(),
      },
    });

    const applyBtn = screen.getByRole("button", { name: "Apply" });
    expect(applyBtn).toBeDisabled();
  });

  it("Apply button is disabled while applyingCoupon=true", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({ summary: mockSummary, applyingCoupon: true }),
        address: makeAddressState(),
      },
    });

    const applyBtn = screen.getByRole("button", { name: "Apply" });
    expect(applyBtn).toBeDisabled();
  });

  it("Remove coupon button is disabled while removingCoupon=true", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState({
          summary: mockSummaryWithCoupon,
          removingCoupon: true,
        }),
        address: makeAddressState(),
      },
    });

    const removeBtn = screen.getByRole("button", { name: "Remove" });
    expect(removeBtn).toBeDisabled();
  });
});

// ---- Place Order COD button ----

describe("CheckoutPage — place COD order button", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders 'Pay & Place Order' button for COD (default)", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState(),
        address: makeAddressState(),
      },
    });

    expect(
      screen.getByRole("button", { name: "Pay & Place Order" }),
    ).toBeInTheDocument();
  });

  it("'Pay & Place Order' button is enabled when address is selected", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState(),
        address: makeAddressState(),
      },
    });

    const placeBtn = screen.getByRole("button", { name: "Pay & Place Order" });
    expect(placeBtn).not.toBeDisabled();
  });

  it("'Pay & Place Order' button is disabled when no addresses exist", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState(),
        address: makeAddressState({ items: [] }),
      },
    });

    const placeBtn = screen.getByRole("button", { name: "Pay & Place Order" });
    expect(placeBtn).toBeDisabled();
  });

  it("'Pay & Place Order' button is disabled when placing=true", () => {
    renderWithProviders(<CheckoutPage />, {
      preloadedState: {
        checkout: makeCheckoutState(),
        address: makeAddressState(),
        order: {
          list: [],
          meta: null,
          detail: null,
          loading: false,
          detailLoading: false,
          placing: true,
          cancellingId: null,
          error: null,
        },
      },
    });

    const placeBtn = screen.getByRole("button", { name: "Pay & Place Order" });
    expect(placeBtn).toBeDisabled();
  });
});

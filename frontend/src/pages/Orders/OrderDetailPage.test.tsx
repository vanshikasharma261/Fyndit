/**
 * Unit tests for `OrderDetailPage`.
 *
 * Verifies:
 *   - The Timeline renders with the order's lifecycle steps.
 *   - The StatusBadge renders the order status (replaces the old inline statusPill).
 *   - The inline statusPill text treatment is NOT used (StatusBadge is).
 *   - Loading, error, and not-found guard states render the expected message.
 *   - Core order detail content (order number, total, product name) renders.
 *   - Cancel button behavior (present when can_cancel=true; absent otherwise).
 *
 * Pattern:
 *   - Follows OrdersPage.test.tsx: thunks are mocked with noop action objects
 *     so the preloaded Redux state is NOT overwritten by useEffect dispatches.
 *   - renderWithProviders provides the full combined reducer tree + MemoryRouter.
 *
 * Scoping note: several text values appear more than once in the rendered page
 * (e.g. the ORDER DATE header shows "01 Jun 2026" AND the Timeline Placed caption
 * also shows "01 Jun 2026"; "Delivered" appears in the StatusBadge AND as a
 * Timeline step label; "Cancelled" appears in the StatusBadge AND as a Timeline
 * step label). These tests use getAllByText or scope to the parent element
 * explicitly wherever this collision occurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../test/renderWithProviders";
import OrderDetailPage from "./OrderDetailPage";
import type { OrderState } from "../../features/order/types";
import type { OrderDetail } from "../../types/order.types";

// ---- Thunk mocks: noop so preloaded state is preserved ----
vi.mock("../../features/order/orderSlice", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../features/order/orderSlice")>();
  return {
    ...actual,
    fetchOrderDetail: vi.fn(() => ({ type: "noop/fetchOrderDetail" })),
    cancelOrder: vi.fn(() => ({
      type: "noop/cancelOrder",
      unwrap: () => Promise.resolve("order-uuid-1"),
    })),
  };
});

// ---- Mock react-toastify ----
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ---- Test fixtures ----

const mockAddress = {
  address_id: "addr-1",
  address_type: "HOME" as const,
  line1: "123 Main St",
  line2: null,
  city: "Mumbai",
  state: "Maharashtra",
  country: "India",
  zip: "400001",
  is_default: true,
};

/** A PENDING order — has can_cancel=true and timeline with "Placed" as current. */
const mockPendingOrder: OrderDetail = {
  order_id: "order-uuid-1",
  order_number: "#A2224894",
  created_at: "2026-06-01T10:00:00.000Z",
  status: "PENDING",
  payment_method: "COD",
  payment_status: "PENDING",
  sub_total: "1300.00",
  coupon_discount: "0.00",
  shipping_fee: "100.00",
  total_amount: "1400.00",
  shipping_address: mockAddress,
  items: [
    {
      order_item_id: "oi-1",
      product_name: "Wireless Headphones",
      brand: "SoundMax",
      image_url: null,
      attributes: { color: "Black" },
      purchase_price: "1300.00",
      quantity: 1,
      line_total: "1300.00",
    },
  ],
  can_cancel: true,
};

/** A DELIVERED order — can_cancel=false, all steps complete. */
const mockDeliveredOrder: OrderDetail = {
  ...mockPendingOrder,
  order_id: "order-uuid-2",
  status: "DELIVERED",
  can_cancel: false,
};

/** A CANCELLED order — 2-step terminal timeline. */
const mockCancelledOrder: OrderDetail = {
  ...mockPendingOrder,
  order_id: "order-uuid-3",
  status: "CANCELLED",
  can_cancel: false,
};

function makeOrderState(overrides?: Partial<OrderState>): OrderState {
  return {
    list: [],
    meta: null,
    detail: null,
    loading: false,
    detailLoading: false,
    placing: false,
    cancellingId: null,
    error: null,
    ...overrides,
  };
}

function renderDetail(stateOverrides?: Partial<OrderState>) {
  return renderWithProviders(<OrderDetailPage />, {
    preloadedState: {
      order: makeOrderState(stateOverrides),
    },
    initialRoute: "/orders/order-uuid-1",
  });
}

// ---- Guard states ----

describe("OrderDetailPage — loading state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading message when detailLoading=true and detail is null", () => {
    renderDetail({ detailLoading: true, detail: null });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});

describe("OrderDetailPage — error state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the error message when error is set and detail is null", () => {
    renderDetail({ error: "Order not found.", detail: null });
    expect(screen.getByText("Order not found.")).toBeInTheDocument();
  });
});

describe("OrderDetailPage — not found state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders 'Order not found.' when detail is null and no error", () => {
    renderDetail({ detail: null });
    expect(screen.getByText("Order not found.")).toBeInTheDocument();
  });
});

// ---- Timeline renders ----

describe("OrderDetailPage — Timeline renders for PENDING order", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the order status timeline landmark (<ol>)", () => {
    renderDetail({ detail: mockPendingOrder });
    // Timeline renders an <ol> — it will be the accessible list with ariaLabel="Order progress"
    expect(screen.getByRole("list", { name: "Order progress" })).toBeInTheDocument();
  });

  it("renders the 5 lifecycle step labels on the timeline", () => {
    renderDetail({ detail: mockPendingOrder });
    const timeline = screen.getByRole("list", { name: "Order progress" });
    // Scope queries to the timeline to avoid false matches elsewhere on the page
    expect(within(timeline).getByText("Placed")).toBeInTheDocument();
    expect(within(timeline).getByText("Confirmed")).toBeInTheDocument();
    expect(within(timeline).getByText("Packed")).toBeInTheDocument();
    expect(within(timeline).getByText("Shipped")).toBeInTheDocument();
    expect(within(timeline).getByText("Delivered")).toBeInTheDocument();
  });

  it("marks the Placed step as aria-current='step' for PENDING status", () => {
    renderDetail({ detail: mockPendingOrder });
    const listItems = screen.getAllByRole("listitem");
    // PENDING → Placed is current → first item has aria-current="step"
    expect(listItems[0]).toHaveAttribute("aria-current", "step");
  });

  it("renders the formatted order date as the Placed step caption", () => {
    renderDetail({ detail: mockPendingOrder });
    // "2026-06-01T10:00:00.000Z" → "01 Jun 2026"
    // NOTE: This date appears twice on the page — once in the ORDER DATE header
    // and once as the Timeline Placed step caption. getAllByText asserts both.
    const dateInstances = screen.getAllByText("01 Jun 2026");
    expect(dateInstances.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the 'Order status' label above the timeline", () => {
    renderDetail({ detail: mockPendingOrder });
    expect(screen.getByText("Order status")).toBeInTheDocument();
  });
});

describe("OrderDetailPage — Timeline renders for CANCELLED order", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders only 2 timeline steps for a CANCELLED order", () => {
    renderDetail({ detail: mockCancelledOrder });
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(2);
  });

  it("renders 'Placed' and 'Cancelled' step labels within the timeline", () => {
    renderDetail({ detail: mockCancelledOrder });
    const timeline = screen.getByRole("list", { name: "Order progress" });
    // Scope to timeline to avoid collision with StatusBadge's "Cancelled" text
    expect(within(timeline).getByText("Placed")).toBeInTheDocument();
    expect(within(timeline).getByText("Cancelled")).toBeInTheDocument();
  });

  it("does NOT render the middle lifecycle labels for a CANCELLED order", () => {
    renderDetail({ detail: mockCancelledOrder });
    const timeline = screen.getByRole("list", { name: "Order progress" });
    expect(within(timeline).queryByText("Confirmed")).not.toBeInTheDocument();
    expect(within(timeline).queryByText("Packed")).not.toBeInTheDocument();
    expect(within(timeline).queryByText("Shipped")).not.toBeInTheDocument();
  });
});

describe("OrderDetailPage — Timeline renders for DELIVERED order", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders 5 timeline steps for a DELIVERED order", () => {
    renderDetail({ detail: mockDeliveredOrder });
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(5);
  });

  it("no step has aria-current='step' when order is DELIVERED (all complete)", () => {
    renderDetail({ detail: mockDeliveredOrder });
    const listItems = screen.getAllByRole("listitem");
    for (const item of listItems) {
      expect(item).not.toHaveAttribute("aria-current");
    }
  });
});

// ---- StatusBadge replaces inline statusPill ----

describe("OrderDetailPage — StatusBadge used for order status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the StatusBadge (title-cased status text) for PENDING order", () => {
    renderDetail({ detail: mockPendingOrder });
    // StatusBadge renders a <span> with title-cased text: "Pending" (not raw "PENDING")
    // titleCase in StatusBadge: first char upper, rest lower → "Pending"
    // "Pending" does NOT appear in the timeline (PENDING is "Placed" on the timeline),
    // so getByText is safe here.
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders the StatusBadge for DELIVERED order — scoped to the status header cell", () => {
    renderDetail({ detail: mockDeliveredOrder });
    // "Delivered" appears both in the StatusBadge AND as a Timeline step label.
    // Scope to the STATUS header cell to assert specifically on the badge.
    const statusLabelEl = screen.getByText("STATUS");
    const headerCell = statusLabelEl.closest("div");
    expect(headerCell).not.toBeNull();
    expect(within(headerCell!).getByText("Delivered")).toBeInTheDocument();
  });

  it("renders the StatusBadge for CANCELLED order — scoped to the status header cell", () => {
    renderDetail({ detail: mockCancelledOrder });
    // "Cancelled" appears both in the StatusBadge AND as a Timeline step label.
    // Scope to the STATUS header cell to assert specifically on the badge.
    const statusLabelEl = screen.getByText("STATUS");
    const headerCell = statusLabelEl.closest("div");
    expect(headerCell).not.toBeNull();
    expect(within(headerCell!).getByText("Cancelled")).toBeInTheDocument();
  });

  it("does NOT render a raw ALL-CAPS PENDING status text in the status header cell", () => {
    // The old inline statusPill rendered the raw status string "PENDING" directly.
    // With StatusBadge, the text is title-cased → "Pending".
    // We confirm the status header cell contains "Pending" (not "PENDING").
    renderDetail({ detail: mockPendingOrder });
    const statusLabelEl = screen.getByText("STATUS");
    const headerCell = statusLabelEl.closest("div");
    // The cell's text content includes the label ("STATUS") + the badge ("Pending")
    expect(headerCell?.textContent).toContain("Pending");
    // The old statusPill would have rendered the bare string "PENDING" — confirm absent
    expect(within(headerCell!).queryByText("PENDING")).not.toBeInTheDocument();
  });
});

// ---- Order content ----

describe("OrderDetailPage — core order content", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the order number", () => {
    renderDetail({ detail: mockPendingOrder });
    expect(screen.getByText("#A2224894")).toBeInTheDocument();
  });

  it("renders the formatted total amount", () => {
    renderDetail({ detail: mockPendingOrder });
    // formatMoney("1400.00") → "₹1,400.00"
    expect(screen.getByText("₹1,400.00")).toBeInTheDocument();
  });

  it("renders the product name", () => {
    renderDetail({ detail: mockPendingOrder });
    expect(screen.getByText("Wireless Headphones")).toBeInTheDocument();
  });

  it("renders the brand", () => {
    renderDetail({ detail: mockPendingOrder });
    expect(screen.getByText("SoundMax")).toBeInTheDocument();
  });

  it("renders the shipping address details", () => {
    renderDetail({ detail: mockPendingOrder });
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText(/Mumbai/)).toBeInTheDocument();
  });

  it("renders the 'Your Order Details' heading", () => {
    renderDetail({ detail: mockPendingOrder });
    expect(
      screen.getByRole("heading", { name: "Your Order Details", level: 1 }),
    ).toBeInTheDocument();
  });

  it("renders the back link to /orders", () => {
    renderDetail({ detail: mockPendingOrder });
    const backLink = screen.getByRole("link", { name: /Order History/ });
    expect(backLink).toHaveAttribute("href", "/orders");
  });
});

// ---- Cancel button ----

describe("OrderDetailPage — Cancel button", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders Cancel button when can_cancel=true", () => {
    renderDetail({ detail: mockPendingOrder });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("does not render Cancel button when can_cancel=false", () => {
    renderDetail({ detail: mockDeliveredOrder });
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("Cancel button is disabled when cancellingId matches the order_id", () => {
    renderDetail({
      detail: mockPendingOrder,
      cancellingId: "order-uuid-1",
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("Cancel button is enabled when cancellingId is null", () => {
    renderDetail({ detail: mockPendingOrder, cancellingId: null });
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
  });
});

// ---- Payment method label ----

describe("OrderDetailPage — payment method", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders 'Cash on Delivery' for COD payment method", () => {
    renderDetail({ detail: mockPendingOrder });
    expect(screen.getByText("Cash on Delivery")).toBeInTheDocument();
  });

  it("renders 'Credit / Debit Card' for STRIPE payment method", () => {
    renderDetail({
      detail: { ...mockPendingOrder, payment_method: "STRIPE" },
    });
    expect(screen.getByText("Credit / Debit Card")).toBeInTheDocument();
  });
});

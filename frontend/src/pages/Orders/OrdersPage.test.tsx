/**
 * OrdersPage unit tests.
 *
 * Thunk mocks return noop action objects (type not handled by the real reducer)
 * so the preloaded Redux state is NOT overwritten on the component's initial
 * useEffect dispatch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../test/renderWithProviders";
import OrdersPage from "./OrdersPage";
import type { OrderState } from "../../features/order/types";
import type { OrderListItem, OrderListMeta } from "../../types/order.types";

// ---- Thunk mocks: return noop so preloaded state is preserved ----
vi.mock("../../features/order/orderSlice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/order/orderSlice")>();
  return {
    ...actual,
    fetchOrders: vi.fn(() => ({ type: "noop/fetchOrders" })),
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

// ---- Shared fixtures ----

const mockListItem: OrderListItem = {
  order_id: "order-uuid-1",
  order_number: "#A2224894",
  product_name: "Wireless Headphones",
  brand: "SoundMax",
  image_url: "/assets/products/headphones/black/1.jpg",
  attributes: { color: "Black", size: "M" },
  item_count: 1,
  total_amount: "1400.00",
  status: "PENDING",
  created_at: "2026-06-01T10:00:00.000Z",
  can_cancel: true,
};

const mockCancelledItem: OrderListItem = {
  order_id: "order-uuid-2",
  order_number: "#B3335005",
  product_name: "Running Shoes",
  brand: "SpeedRun",
  image_url: null,
  attributes: { size: "42" },
  item_count: 2,
  total_amount: "2500.00",
  status: "DELIVERED",
  created_at: "2026-05-15T14:00:00.000Z",
  can_cancel: false,
};

const mockMeta: OrderListMeta = {
  page: 1,
  limit: 10,
  total: 2,
  total_pages: 1,
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

// ---- Loading state ----

describe("OrdersPage — loading state", () => {
  it("renders loading message when loading and list is empty", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({ loading: true, list: [] }),
      },
    });

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});

// ---- Error state ----

describe("OrdersPage — error state", () => {
  it("renders error message when error is set and list is empty", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({
          error: "Unable to reach the server. Please check your connection.",
          list: [],
        }),
      },
    });

    expect(
      screen.getByText("Unable to reach the server. Please check your connection."),
    ).toBeInTheDocument();
  });
});

// ---- Empty state ----

describe("OrdersPage — empty state", () => {
  it("renders empty message when no orders exist", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({ list: [] }),
      },
    });

    expect(
      screen.getByText("You have not placed any orders yet."),
    ).toBeInTheDocument();
  });

  it("renders 'Start shopping' CTA link in empty state", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({ list: [] }),
      },
    });

    const cta = screen.getByRole("link", { name: "Start shopping" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/");
  });
});

// ---- Populated list ----

describe("OrdersPage — populated list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderPopulated() {
    return renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({
          list: [mockListItem, mockCancelledItem],
          meta: mockMeta,
        }),
      },
    });
  }

  it("renders 'Order History' heading", () => {
    renderPopulated();
    expect(
      screen.getByRole("heading", { name: "Order History", level: 1 }),
    ).toBeInTheDocument();
  });

  it("renders order number for each row", () => {
    renderPopulated();
    expect(screen.getByText("#A2224894")).toBeInTheDocument();
    expect(screen.getByText("#B3335005")).toBeInTheDocument();
  });

  it("renders product name for each row", () => {
    renderPopulated();
    expect(screen.getByText("Wireless Headphones")).toBeInTheDocument();
    expect(screen.getByText("Running Shoes")).toBeInTheDocument();
  });

  it("renders formatted total amount for each row", () => {
    renderPopulated();
    // formatMoney("1400.00") → "₹1,400.00"
    expect(screen.getByText("₹1,400.00")).toBeInTheDocument();
    // formatMoney("2500.00") → "₹2,500.00"
    expect(screen.getByText("₹2,500.00")).toBeInTheDocument();
  });

  it("renders formatted date for the first row", () => {
    renderPopulated();
    // "2026-06-01T10:00:00.000Z" → "01 Jun 2026"
    expect(screen.getByText("01 Jun 2026")).toBeInTheDocument();
  });

  it("renders StatusBadge (title-cased) for each row", () => {
    renderPopulated();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });

  it("renders attributes for each row", () => {
    renderPopulated();
    expect(screen.getByText("Black")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders 'View' link for each order pointing to the detail route", () => {
    renderPopulated();
    const viewLinks = screen.getAllByRole("link", { name: "View" });
    expect(viewLinks).toHaveLength(2);
    expect(viewLinks[0]).toHaveAttribute("href", "/orders/order-uuid-1");
    expect(viewLinks[1]).toHaveAttribute("href", "/orders/order-uuid-2");
  });

  it("renders Cancel button only for orders where can_cancel=true", () => {
    renderPopulated();
    // mockListItem has can_cancel=true, mockCancelledItem has can_cancel=false
    const cancelButtons = screen.queryAllByRole("button", { name: "Cancel" });
    expect(cancelButtons).toHaveLength(1);
  });

  it("renders +N more items label when item_count > 1", () => {
    renderPopulated();
    // mockCancelledItem has item_count=2 → "+1 more item"
    expect(screen.getByText("+1 more item")).toBeInTheDocument();
  });

  it("renders product image when image_url is present", () => {
    renderPopulated();
    const img = screen.getByAltText("Wireless Headphones");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      "src",
      "http://localhost:3000/assets/products/headphones/black/1.jpg",
    );
  });

  it("renders a placeholder div when image_url is null", () => {
    renderPopulated();
    // Running Shoes has null image_url — no img element for it
    const imgs = screen.queryAllByRole("img");
    // Only one img (Wireless Headphones); Running Shoes uses a placeholder div
    expect(imgs).toHaveLength(1);
  });
});

// ---- Cancel button interaction ----

describe("OrdersPage — Cancel button states", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("Cancel button is disabled when cancellingId matches the order", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({
          list: [mockListItem],
          meta: mockMeta,
          cancellingId: "order-uuid-1",
        }),
      },
    });

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toBeDisabled();
  });

  it("Cancel button is enabled when cancellingId is null", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({
          list: [mockListItem],
          meta: mockMeta,
          cancellingId: null,
        }),
      },
    });

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).not.toBeDisabled();
  });

  it("Cancel button is enabled when a different order is being cancelled", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({
          list: [mockListItem],
          meta: mockMeta,
          cancellingId: "order-uuid-999",
        }),
      },
    });

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).not.toBeDisabled();
  });
});

// ---- Table column headers ----

describe("OrdersPage — table column headers", () => {
  it("renders all required column headers", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({
          list: [mockListItem],
          meta: mockMeta,
        }),
      },
    });

    expect(screen.getByText("PRODUCT")).toBeInTheDocument();
    expect(screen.getByText("ORDER ID")).toBeInTheDocument();
    expect(screen.getByText("DATE")).toBeInTheDocument();
    expect(screen.getByText("TOTAL")).toBeInTheDocument();
    expect(screen.getByText("STATUS")).toBeInTheDocument();
    expect(screen.getByText("ATTRIBUTES")).toBeInTheDocument();
    expect(screen.getByText("ACTION")).toBeInTheDocument();
  });
});

// ---- Pagination ----

describe("OrdersPage — pagination", () => {
  it("does not render pagination nav when meta is null", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({
          list: [mockListItem],
          meta: null,
        }),
      },
    });

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("renders pagination when meta has total_pages > 1", () => {
    renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({
          list: [mockListItem],
          meta: { page: 1, limit: 10, total: 25, total_pages: 3 },
        }),
      },
    });

    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});

// ---- Renders without crash ----

describe("OrdersPage — renders table without error", () => {
  it("renders the order history table", async () => {
    const { container } = renderWithProviders(<OrdersPage />, {
      preloadedState: {
        order: makeOrderState({
          list: [mockListItem],
          meta: mockMeta,
        }),
      },
    });

    await waitFor(() => {
      expect(container.querySelector("table")).toBeInTheDocument();
    });
  });
});

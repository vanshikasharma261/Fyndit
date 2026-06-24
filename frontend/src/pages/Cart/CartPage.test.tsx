import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/renderWithProviders";
import CartPage from "./CartPage";
import type { CartItem, CartSummary } from "../../types/cart.types";

// ---- Mock the cart service (fetchCart is dispatched on mount) ----
vi.mock("../../features/cart/cartService", () => ({
  cartService: {
    get: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

// ---- Stub react-toastify so we can assert on it ----
vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { cartService } from "../../features/cart/cartService";
import { toast } from "react-toastify";

const mockCartService = cartService as {
  get: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

// Use `as unknown as` to cross the structural incompatibility between the
// real `typeof toast` and our mock shape. This is safe because vi.mock()
// above has already replaced the module with stub functions.
const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

// ---- Fixtures ----

const mockSummary: CartSummary = {
  total_items: 2,
  total_price: "2000.00",
  total_discount: "200.00",
  final_amount: "1800.00",
};

const mockItem: CartItem = {
  cart_item_id: "item-1",
  product_variant_id: "variant-1",
  product_name: "Wireless Headphones",
  brand: "SoundBrand",
  description: "Crystal clear audio",
  image_url: "/assets/products/headphones/image1.jpg",
  price: "1000.00",
  discount: "100.00",
  final_price: "900.00",
  quantity: 2,
  stock: 10,
  attributes: { color: "Black", size: "One Size" },
};

const mockItemAtMin: CartItem = {
  ...mockItem,
  cart_item_id: "item-min",
  quantity: 1,
};

const mockItemAtMax: CartItem = {
  ...mockItem,
  cart_item_id: "item-max",
  quantity: 10, // quantity === stock (at max)
  stock: 10,
};

// ---- Helpers ----

function renderEmptyCart() {
  mockCartService.get.mockResolvedValue({
    ok: true,
    data: {
      summary: {
        total_items: 0,
        total_price: "0.00",
        total_discount: "0.00",
        final_amount: "0.00",
      },
      items: [],
    },
  });
  return renderWithProviders(<CartPage />);
}

function renderPopulatedCart(items: CartItem[] = [mockItem]) {
  mockCartService.get.mockResolvedValue({
    ok: true,
    data: { summary: mockSummary, items },
  });
  return renderWithProviders(<CartPage />);
}

function renderLoadingCart() {
  mockCartService.get.mockReturnValue(new Promise(() => {})); // never-resolving
  return renderWithProviders(<CartPage />);
}

function renderErrorCart(message = "Failed to load cart") {
  mockCartService.get.mockResolvedValue({
    ok: false,
    data: { statusCode: 500, message, error: "Internal Server Error" },
  });
  return renderWithProviders(<CartPage />);
}

// ---- Tests ----

describe("CartPage — loading state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows loading text while cart is being fetched", () => {
    renderLoadingCart();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});

describe("CartPage — error state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the error message when cart fetch fails", async () => {
    renderErrorCart("Unable to load your cart");
    await waitFor(() => {
      expect(screen.getByText("Unable to load your cart")).toBeInTheDocument();
    });
  });
});

describe("CartPage — empty cart state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders 'Your Cart is empty' heading", async () => {
    renderEmptyCart();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Your Cart is empty" }),
      ).toBeInTheDocument();
    });
  });

  it("does NOT render the Shopping Cart section heading", async () => {
    renderEmptyCart();
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Shopping Cart" }),
      ).not.toBeInTheDocument();
    });
  });

  it("does NOT render the CHECKOUT button", async () => {
    renderEmptyCart();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "CHECKOUT" }),
      ).not.toBeInTheDocument();
    });
  });

  it("does NOT render the PRICE DETAILS panel", async () => {
    renderEmptyCart();
    await waitFor(() => {
      expect(screen.queryByText("PRICE DETAILS")).not.toBeInTheDocument();
    });
  });

  it("renders the empty-cart supporting copy", async () => {
    renderEmptyCart();
    await waitFor(() => {
      expect(
        screen.getByText("Browse the catalog and add items to get started."),
      ).toBeInTheDocument();
    });
  });

  it("renders the 'Continue shopping' call-to-action", async () => {
    renderEmptyCart();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Continue shopping" }),
      ).toBeInTheDocument();
    });
  });
});

describe("CartPage — populated cart state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the 'Shopping Cart' heading", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Shopping Cart" }),
      ).toBeInTheDocument();
    });
  });

  it("renders the product name", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(screen.getByText("Wireless Headphones")).toBeInTheDocument();
    });
  });

  it("renders the brand name", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(screen.getByText("SoundBrand")).toBeInTheDocument();
    });
  });

  it("renders the item description", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(screen.getByText("Crystal clear audio")).toBeInTheDocument();
    });
  });

  it("renders attribute pills", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(screen.getByText("color:Black")).toBeInTheDocument();
      expect(screen.getByText("size:One Size")).toBeInTheDocument();
    });
  });

  it("shows 'In Stock' status for in-stock item", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(screen.getByText("In Stock")).toBeInTheDocument();
    });
  });

  it("shows 'Out of Stock' status for zero-stock item", async () => {
    const outOfStockItem = { ...mockItem, stock: 0 };
    mockCartService.get.mockResolvedValue({
      ok: true,
      data: { summary: mockSummary, items: [outOfStockItem] },
    });
    renderWithProviders(<CartPage />);
    await waitFor(() => {
      expect(screen.getByText("Out of Stock")).toBeInTheDocument();
    });
  });

  it("renders the quantity value", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("renders quantity span with aria-label 'Quantity: N'", async () => {
    renderPopulatedCart();
    // The quantity <span> now carries aria-label="Quantity: 2" (sourced from CartPage).
    await waitFor(() => {
      expect(
        screen.getByRole("generic", { name: "Quantity: 2" }),
      ).toBeInTheDocument();
    });
  });

  it("renders the delivery note text from CartMessages.deliveryNote", async () => {
    renderPopulatedCart();
    // CartMessages.deliveryNote = "Item Will be delivered within 5 days." (capital W)
    await waitFor(() => {
      expect(
        screen.getByText("Item Will be delivered within 5 days."),
      ).toBeInTheDocument();
    });
  });

  it("renders the PRICE DETAILS heading", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(screen.getByText("PRICE DETAILS")).toBeInTheDocument();
    });
  });

  it("renders the CHECKOUT button", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "CHECKOUT" }),
      ).toBeInTheDocument();
    });
  });

  it("renders the Remove Item button", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      // The "Remove Item" text button in the remove row
      expect(screen.getByText("Remove Item")).toBeInTheDocument();
    });
  });

  it("renders the savings message when discount > 0", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      expect(
        screen.getByText(/You will save/),
      ).toBeInTheDocument();
    });
  });

  it("renders discount percentage badge when discount > 0", async () => {
    renderPopulatedCart();
    await waitFor(() => {
      // 100/1000 = 10%
      expect(screen.getByText("10%")).toBeInTheDocument();
    });
  });

  it("does NOT render discount badge when discount is 0", async () => {
    const noDiscountItem = {
      ...mockItem,
      discount: "0.00",
      final_price: "1000.00",
    };
    mockCartService.get.mockResolvedValue({
      ok: true,
      data: {
        summary: { ...mockSummary, total_discount: "0.00" },
        items: [noDiscountItem],
      },
    });
    renderWithProviders(<CartPage />);
    await waitFor(() => {
      expect(screen.queryByText("0%")).not.toBeInTheDocument();
    });
  });
});

describe("CartPage — quantity stepper controls", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders + button and - button when quantity > 1", async () => {
    renderPopulatedCart([mockItem]); // quantity=2
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Increase quantity" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Decrease quantity" }),
      ).toBeInTheDocument();
    });
  });

  it("renders trash icon button at quantity=1 instead of − button", async () => {
    renderPopulatedCart([mockItemAtMin]); // quantity=1
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Increase quantity" }),
      ).toBeInTheDocument();
      // At qty=1, the stepper shows remove (trash) instead of −
      // There are two Remove item buttons: the stepper one (aria-label="Remove item") and the bottom row "Remove Item"
      expect(
        screen.getByRole("button", { name: "Remove item" }),
      ).toBeInTheDocument();
    });
  });

  it("+ button is disabled when quantity equals stock (at max)", async () => {
    renderPopulatedCart([mockItemAtMax]); // quantity=10, stock=10
    await waitFor(() => {
      const increaseBtn = screen.getByRole("button", { name: "Increase quantity" });
      expect(increaseBtn).toBeDisabled();
    });
  });

  it("+ button is enabled when quantity is below stock", async () => {
    renderPopulatedCart([mockItem]); // quantity=2, stock=10
    await waitFor(() => {
      const increaseBtn = screen.getByRole("button", { name: "Increase quantity" });
      expect(increaseBtn).not.toBeDisabled();
    });
  });

  it("dispatches updateCartItem when + is clicked", async () => {
    const user = userEvent.setup();
    const updatedItem = { ...mockItem, quantity: 3 };
    mockCartService.get.mockResolvedValue({
      ok: true,
      data: { summary: mockSummary, items: [mockItem] },
    });
    mockCartService.update.mockResolvedValue({
      ok: true,
      data: {
        message: "Updated",
        item: updatedItem,
        summary: { ...mockSummary, total_items: 3 },
      },
    });

    renderWithProviders(<CartPage />);

    const increaseBtn = await screen.findByRole("button", {
      name: "Increase quantity",
    });
    await user.click(increaseBtn);

    await waitFor(() => {
      expect(mockCartService.update).toHaveBeenCalledWith("item-1", 3);
    });
  });

  it("dispatches removeCartItem when trash button at qty=1 is clicked", async () => {
    const user = userEvent.setup();
    mockCartService.get.mockResolvedValue({
      ok: true,
      data: { summary: mockSummary, items: [mockItemAtMin] },
    });
    mockCartService.remove.mockResolvedValue({
      ok: true,
      data: { message: "Removed" },
    });
    // After remove, fetchCart is called internally
    mockCartService.get
      .mockResolvedValueOnce({
        ok: true,
        data: { summary: mockSummary, items: [mockItemAtMin] },
      })
      .mockResolvedValue({
        ok: true,
        data: {
          summary: {
            total_items: 0,
            total_price: "0.00",
            total_discount: "0.00",
            final_amount: "0.00",
          },
          items: [],
        },
      });

    renderWithProviders(<CartPage />);

    const trashBtn = await screen.findByRole("button", {
      name: "Remove item",
    });
    await user.click(trashBtn);

    await waitFor(() => {
      expect(mockCartService.remove).toHaveBeenCalledWith("item-min");
    });
  });

  it("dispatches removeCartItem when 'Remove Item' button is clicked", async () => {
    const user = userEvent.setup();
    mockCartService.get.mockResolvedValue({
      ok: true,
      data: { summary: mockSummary, items: [mockItem] },
    });
    mockCartService.remove.mockResolvedValue({
      ok: true,
      data: { message: "Removed" },
    });
    mockCartService.get
      .mockResolvedValueOnce({
        ok: true,
        data: { summary: mockSummary, items: [mockItem] },
      })
      .mockResolvedValue({
        ok: true,
        data: {
          summary: {
            total_items: 0,
            total_price: "0.00",
            total_discount: "0.00",
            final_amount: "0.00",
          },
          items: [],
        },
      });

    renderWithProviders(<CartPage />);

    const removeBtn = await screen.findByText("Remove Item");
    await user.click(removeBtn);

    await waitFor(() => {
      expect(mockCartService.remove).toHaveBeenCalledWith("item-1");
    });
  });

  it("shows error toast when updateCartItem fails", async () => {
    const user = userEvent.setup();
    mockCartService.get.mockResolvedValue({
      ok: true,
      data: { summary: mockSummary, items: [mockItem] },
    });
    mockCartService.update.mockResolvedValue({
      ok: false,
      data: { statusCode: 400, message: "Exceeds stock", error: "Bad Request" },
    });

    renderWithProviders(<CartPage />);

    const increaseBtn = await screen.findByRole("button", {
      name: "Increase quantity",
    });
    await user.click(increaseBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Exceeds stock");
    });
  });

  it("second item's + button works independently while first item mutates", async () => {
    // Verifies that removing the global mutatingId guard means per-line
    // buttons on OTHER lines remain independently interactive.
    const user = userEvent.setup();
    const secondItem: CartItem = {
      ...mockItem,
      cart_item_id: "item-2",
      product_variant_id: "variant-2",
      product_name: "Running Shoes",
    };

    // item-1 is mutating (mutatingId="item-1"), item-2's + should still be enabled
    mockCartService.get.mockResolvedValue({
      ok: true,
      data: { summary: mockSummary, items: [mockItem, secondItem] },
    });
    // item-1 update never resolves (simulates busy state for item-1)
    mockCartService.update
      .mockImplementationOnce(() => new Promise(() => {})) // item-1 hangs
      .mockResolvedValue({
        ok: true,
        data: {
          message: "Updated",
          item: { ...secondItem, quantity: 3 },
          summary: { ...mockSummary, total_items: 3 },
        },
      });

    renderWithProviders(<CartPage />);

    const [increaseItem1] = await screen.findAllByRole("button", {
      name: "Increase quantity",
    });

    // Click item-1's + to start a mutation on that line
    await user.click(increaseItem1);

    // item-2's + button should still be enabled (no global guard)
    const increaseButtons = screen.getAllByRole("button", {
      name: "Increase quantity",
    });
    // After item-1's mutation starts, item-1's own + is disabled (busy),
    // but item-2's + remains enabled.
    expect(increaseButtons[1]).not.toBeDisabled();
  });
});

describe("CartPage — multiple items", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders all items in the cart", async () => {
    const secondItem: CartItem = {
      ...mockItem,
      cart_item_id: "item-2",
      product_name: "Running Shoes",
      brand: "SpeedBrand",
    };
    renderPopulatedCart([mockItem, secondItem]);

    await waitFor(() => {
      expect(screen.getByText("Wireless Headphones")).toBeInTheDocument();
      expect(screen.getByText("Running Shoes")).toBeInTheDocument();
    });
  });
});

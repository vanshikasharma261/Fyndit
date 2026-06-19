/**
 * Checkout + Orders E2E tests — Playwright.
 *
 * Follows the established address.spec.ts / cart.spec.ts pattern:
 *   - All API calls are intercepted with page.route() anchored to the API origin
 *     (http://localhost:3000) so Vite's HTML responses are never clobbered.
 *   - /auth/me, /user, and /cart are mocked in every authenticated session to
 *     prevent authExpiryMiddleware → sessionExpired → redirect to /login.
 *   - Stripe is NOT exercised in these tests. The card-payment flow requires a
 *     real Stripe.js context that can't be driven in a fully route-mocked env.
 *     The COD happy path + order history + order detail are covered instead.
 *   - page.waitForResponse() is always set up BEFORE the triggering click.
 *   - State transitions use boolean flags, not call counters, to survive React
 *     StrictMode double-invoking effects.
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const API_URL = "http://localhost:3000";

// ---- Shared fixtures ----

const mockUser = {
  id: "user-1",
  email: "jane@example.com",
  first_name: "Jane",
  last_name: "Doe",
  user_name: "janedoe",
  phone: "9876543210",
};

const mockEmptyCart = {
  summary: {
    total_items: 0,
    total_price: "0.00",
    total_discount: "0.00",
    final_amount: "0.00",
  },
  items: [],
};

const mockAddress = {
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

const mockAddress2 = {
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

const mockCheckoutSummary = {
  items: [
    {
      cart_item_id: "ci-1",
      product_variant_id: "pv-1",
      product_name: "Wireless Headphones",
      brand: "SoundMax",
      image_url: null,
      attributes: { color: "Black" },
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

const mockCheckoutSummaryWithCoupon = {
  ...mockCheckoutSummary,
  coupon_discount: "130.00",
  total: "1270.00",
  applied_coupon: {
    code: "SAVE10",
    discount_type: "PERCENTAGE",
    discount_value: "10.00",
    discount_amount: "130.00",
  },
};

const mockPlacedOrder = {
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

const mockOrderListItem = {
  order_id: "order-uuid-1",
  order_number: "#A2224894",
  product_name: "Wireless Headphones",
  brand: "SoundMax",
  image_url: null,
  attributes: { color: "Black" },
  item_count: 1,
  total_amount: "1400.00",
  status: "PENDING",
  created_at: "2026-06-01T10:00:00.000Z",
  can_cancel: true,
};

const mockOrderListItemDelivered = {
  order_id: "order-uuid-2",
  order_number: "#B3335005",
  product_name: "Running Shoes",
  brand: "SpeedRun",
  image_url: null,
  attributes: { size: "42" },
  item_count: 1,
  total_amount: "2500.00",
  status: "DELIVERED",
  created_at: "2026-05-15T14:00:00.000Z",
  can_cancel: false,
};

const mockOrderListResponse = {
  orders: [mockOrderListItem, mockOrderListItemDelivered],
  meta: { page: 1, limit: 10, total: 2, total_pages: 1 },
};

// ---- Setup helpers ----

/**
 * Sets up a standard authenticated session — /auth/me, /user, and /cart.
 * The /cart mock prevents authExpiryMiddleware → sessionExpired when there is
 * no real cookie.
 */
async function setupAuthenticatedSession(page: Page) {
  await page.route(`${API_URL}/auth/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUser),
    });
  });

  await page.route(`${API_URL}/user`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(`${API_URL}/cart`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockEmptyCart),
      });
    } else {
      await route.continue();
    }
  });
}

// ---- Access control ----

test.describe("Checkout — access control", () => {
  test("unauthenticated user is redirected to /login when visiting /checkout", async ({
    page,
  }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized" }),
      });
    });

    await page.goto("/checkout");
    await expect(page).toHaveURL("/login");
  });

  test("unauthenticated user is redirected to /login when visiting /orders", async ({
    page,
  }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized" }),
      });
    });

    await page.goto("/orders");
    await expect(page).toHaveURL("/login");
  });
});

// ---- Checkout page — rendering ----

test.describe("Checkout — page rendering", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummary),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress, mockAddress2]),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("renders Checkout heading", async ({ page }) => {
    await page.goto("/checkout");
    await expect(
      page.getByRole("heading", { name: "Checkout", level: 1 }),
    ).toBeVisible();
  });

  test("renders personal information section with user details", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByText("PERSONAL INFORMATION")).toBeVisible();
    await expect(page.getByText("Jane", { exact: true })).toBeVisible();
    await expect(page.getByText("Doe", { exact: true })).toBeVisible();
    await expect(page.getByText("jane@example.com")).toBeVisible();
  });

  test("renders both address cards in the shipping section", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByText("123 Main St")).toBeVisible();
    await expect(page.getByText("456 Office Park")).toBeVisible();
  });

  test("renders COD and Card payment options", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByText("Cash on Delivery")).toBeVisible();
    await expect(page.getByText("Credit / Debit Card")).toBeVisible();
  });

  test("renders SHOPPING BAG section with product", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByText("SHOPPING BAG")).toBeVisible();
    await expect(page.getByText("Wireless Headphones")).toBeVisible();
    await expect(page.getByText("SoundMax")).toBeVisible();
  });

  test("renders shipping fee and total in the bag summary", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByText("Shipping Fee")).toBeVisible();
    await expect(page.getByText("₹100.00")).toBeVisible();
    await expect(page.getByText("Total")).toBeVisible();
    await expect(page.getByText("₹1,400.00")).toBeVisible();
  });

  test("renders promo code input and Apply button", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByPlaceholder("Promo Code")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
  });

  test("renders 'Pay & Place Order' button for COD flow", async ({ page }) => {
    await page.goto("/checkout");
    await expect(
      page.getByRole("button", { name: "Pay & Place Order" }),
    ).toBeVisible();
  });
});

// ---- Checkout page — coupon apply ----

test.describe("Checkout — apply coupon", () => {
  test("applying a valid coupon shows the coupon code and discount", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    let couponApplied = false;

    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummary),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/checkout/coupon`, async (route) => {
      if (route.request().method() === "POST") {
        couponApplied = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummaryWithCoupon),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout");
    await expect(page.getByPlaceholder("Promo Code")).toBeVisible();

    await page.getByPlaceholder("Promo Code").fill("SAVE10");

    const couponResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/checkout/coupon") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Apply" }).click();
    await couponResponsePromise;

    expect(couponApplied).toBe(true);

    // After coupon is applied: code is shown, discount line appears
    await expect(page.getByText("SAVE10")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Discount")).toBeVisible({ timeout: 5000 });
  });

  test("shows error toast when applying an invalid coupon", async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummary),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/checkout/coupon`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 400,
            message: "Invalid or expired coupon",
            error: "Bad Request",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout");
    await page.getByPlaceholder("Promo Code").fill("BADCODE");

    const couponResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/checkout/coupon") &&
        response.request().method() === "POST" &&
        response.status() === 400,
    );
    await page.getByRole("button", { name: "Apply" }).click();
    await couponResponsePromise;

    // Error toast with the server message
    await expect(
      page.getByText("Invalid or expired coupon"),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---- Checkout page — remove coupon ----

test.describe("Checkout — remove coupon", () => {
  test("removing an applied coupon hides the coupon code and discount line", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    let couponRemoved = false;

    // Initial checkout has a coupon applied
    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummaryWithCoupon),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/checkout/coupon`, async (route) => {
      if (route.request().method() === "DELETE") {
        couponRemoved = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummary),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout");

    // Coupon SAVE10 should be shown
    await expect(page.getByText("SAVE10")).toBeVisible();

    const removeResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/checkout/coupon") &&
        response.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: "Remove" }).click();
    await removeResponsePromise;

    expect(couponRemoved).toBe(true);

    // After removal: promo input should reappear, discount line should be gone
    await expect(page.getByPlaceholder("Promo Code")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("SAVE10")).not.toBeVisible({ timeout: 5000 });
  });
});

// ---- COD order placement happy path ----

test.describe("Checkout — COD happy path", () => {
  test("placing a COD order navigates to the order detail page", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummary),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/order*`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(mockPlacedOrder),
        });
      } else if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockOrderListResponse),
        });
      } else {
        await route.continue();
      }
    });

    // Mock the order detail page fetch (navigated to after placement)
    await page.route(`${API_URL}/order/order-uuid-1`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPlacedOrder),
      });
    });

    await page.goto("/checkout");

    // Ensure the page loaded the summary
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

    // Click Pay & Place Order
    const orderResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${API_URL}/order` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Pay & Place Order" }).click();
    await orderResponsePromise;

    // After successful placement, the app navigates to /orders/:orderId
    await expect(page).toHaveURL(/\/orders\/order-uuid-1/, { timeout: 10000 });
  });

  test("shows error toast when COD placement fails (e.g. out of stock)", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummary),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/order*`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 400,
            message: "Item is no longer in stock",
            error: "Bad Request",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

    const orderResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${API_URL}/order` &&
        response.request().method() === "POST" &&
        response.status() === 400,
    );
    await page.getByRole("button", { name: "Pay & Place Order" }).click();
    await orderResponsePromise;

    // Error toast with the server message
    await expect(
      page.getByText("Item is no longer in stock"),
    ).toBeVisible({ timeout: 5000 });

    // Stays on checkout page (no redirect)
    await expect(page).toHaveURL("/checkout");
  });
});

// ---- Checkout — add address inline ----

test.describe("Checkout — inline Add Address form", () => {
  test("clicking 'Add Address' shows the inline AddressForm", async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummary),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout");
    await expect(page.getByRole("button", { name: "Add Address" })).toBeVisible();

    await page.getByRole("button", { name: "Add Address" }).click();

    // AddressForm should now be visible
    await expect(page.getByLabel("Line 1")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("cancelling the inline form returns to the address list", async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummary),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout");
    await page.getByRole("button", { name: "Add Address" }).click();
    await expect(page.getByLabel("Line 1")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    // Address list should reappear; AddressForm should be gone
    await expect(page.getByText("123 Main St")).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("Line 1")).not.toBeVisible();
  });
});

// ---- Checkout — empty cart redirect ----

test.describe("Checkout — empty cart", () => {
  test("shows 'Nothing to check out' when total_items is 0", async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...mockCheckoutSummary, total_items: 0 }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/checkout");
    await expect(page.getByText("Nothing to check out")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to cart" })).toBeVisible();
  });
});

// ---- Orders page — rendering ----

test.describe("Orders — page rendering", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/order*`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockOrderListResponse),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("renders 'Order History' heading", async ({ page }) => {
    await page.goto("/orders");
    await expect(
      page.getByRole("heading", { name: "Order History" }),
    ).toBeVisible();
  });

  test("renders order rows with order numbers", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByText("#A2224894")).toBeVisible();
    await expect(page.getByText("#B3335005")).toBeVisible();
  });

  test("renders status pill for each order", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByText("PENDING")).toBeVisible();
    await expect(page.getByText("DELIVERED")).toBeVisible();
  });

  test("renders formatted total amounts", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByText("₹1,400.00")).toBeVisible();
    await expect(page.getByText("₹2,500.00")).toBeVisible();
  });

  test("renders 'View' link for each order", async ({ page }) => {
    await page.goto("/orders");
    const viewLinks = page.getByRole("link", { name: "View" });
    await expect(viewLinks).toHaveCount(2);
  });

  test("renders Cancel button only for can_cancel=true orders", async ({ page }) => {
    await page.goto("/orders");
    const cancelButtons = page.getByRole("button", { name: "Cancel" });
    // Only mockOrderListItem has can_cancel=true
    await expect(cancelButtons).toHaveCount(1);
  });

  test("renders formatted order date", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByText("01 Jun 2026")).toBeVisible();
  });

  test("renders product name in each row", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByText("Wireless Headphones")).toBeVisible();
    await expect(page.getByText("Running Shoes")).toBeVisible();
  });
});

// ---- Orders page — empty state ----

test.describe("Orders — empty state", () => {
  test("shows empty message when no orders exist", async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/order*`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ orders: [], meta: { page: 1, limit: 10, total: 0, total_pages: 0 } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/orders");
    await expect(
      page.getByText("You have not placed any orders yet."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Start shopping" })).toBeVisible();
  });
});

// ---- Orders page — cancel order ----

test.describe("Orders — cancel order", () => {
  test("cancelling an order shows success toast and re-fetches the list", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    let orderCancelled = false;

    await page.route(`${API_URL}/order*`, async (route) => {
      if (route.request().method() === "GET") {
        const updatedList = orderCancelled
          ? {
              orders: [
                { ...mockOrderListItem, status: "CANCELLED", can_cancel: false },
                mockOrderListItemDelivered,
              ],
              meta: { page: 1, limit: 10, total: 2, total_pages: 1 },
            }
          : mockOrderListResponse;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(updatedList),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/order/order-uuid-1/cancel`, async (route) => {
      if (route.request().method() === "PATCH") {
        orderCancelled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Order cancelled" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/orders");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    const cancelResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/order/order-uuid-1/cancel") &&
        response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Cancel" }).click();
    await cancelResponsePromise;

    // Success toast
    await expect(page.getByText("Order cancelled")).toBeVisible({ timeout: 5000 });
  });

  test("shows error toast when cancellation fails", async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/order*`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockOrderListResponse),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/order/order-uuid-1/cancel`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 400,
            message: "Order cannot be cancelled",
            error: "Bad Request",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/orders");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    const cancelResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/order/order-uuid-1/cancel") &&
        response.request().method() === "PATCH" &&
        response.status() === 400,
    );
    await page.getByRole("button", { name: "Cancel" }).click();
    await cancelResponsePromise;

    // Error toast
    await expect(
      page.getByText("Order cannot be cancelled"),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---- Order detail page ----

test.describe("Order detail — rendering", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/order/order-uuid-1`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockPlacedOrder),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("renders order detail page at /orders/:orderId", async ({ page }) => {
    await page.goto("/orders/order-uuid-1");
    // The detail page should render — look for the order number
    await expect(page.getByText("#A2224894")).toBeVisible({ timeout: 10000 });
  });

  test("renders order total amount on detail page", async ({ page }) => {
    await page.goto("/orders/order-uuid-1");
    await expect(page.getByText("₹1,400.00")).toBeVisible({ timeout: 10000 });
  });

  test("renders product name on detail page", async ({ page }) => {
    await page.goto("/orders/order-uuid-1");
    await expect(page.getByText("Wireless Headphones")).toBeVisible({
      timeout: 10000,
    });
  });
});

// ---- Checkout — responsive layout ----

test.describe("Checkout — responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/checkout`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockCheckoutSummary),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([mockAddress]),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("renders Checkout page correctly at desktop width (1280px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/checkout");
    await expect(
      page.getByRole("heading", { name: "Checkout" }),
    ).toBeVisible();
    await expect(page.getByText("SHOPPING BAG")).toBeVisible();
  });

  test("renders Checkout page correctly at tablet width (768px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/checkout");
    await expect(
      page.getByRole("heading", { name: "Checkout" }),
    ).toBeVisible();
  });

  test("renders Checkout page correctly at mobile width (375px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/checkout");
    await expect(
      page.getByRole("heading", { name: "Checkout" }),
    ).toBeVisible();
  });
});

// ---- Orders — responsive layout ----

test.describe("Orders — responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/order*`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockOrderListResponse),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("renders Order History correctly at desktop width (1280px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/orders");
    await expect(
      page.getByRole("heading", { name: "Order History" }),
    ).toBeVisible();
  });

  test("renders Order History correctly at tablet width (768px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/orders");
    await expect(
      page.getByRole("heading", { name: "Order History" }),
    ).toBeVisible();
  });

  test("renders Order History correctly at mobile width (375px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/orders");
    await expect(
      page.getByRole("heading", { name: "Order History" }),
    ).toBeVisible();
  });
});

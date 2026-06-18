import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Cart Feature E2E tests — Playwright against mocked backend API.
 *
 * Follows the pattern from auth.spec.ts and user-profile.spec.ts:
 * - Anchor all page.route() calls to the API origin (http://localhost:3000)
 *   to avoid intercepting Vite dev-server navigation requests.
 * - Use a mutable flag for the /auth/me intercept to handle React StrictMode
 *   double-firing (same pattern as auth.spec.ts).
 * - Always set up page.waitForResponse() BEFORE the action that triggers the
 *   request — never after the click — to avoid missing the response.
 * - Use flag-based GET /cart state transitions rather than a call counter to
 *   survive React StrictMode double-invoking effects.
 */

const API_URL = "http://localhost:3000";

// ---- Shared fixtures ----

const mockUser = {
  id: "user-1",
  email: "jane@example.com",
  first_name: "Jane",
  last_name: "Doe",
  user_name: "janedoe",
};

const mockCartItem = {
  cart_item_id: "item-1",
  product_variant_id: "variant-1",
  product_name: "Wireless Headphones",
  brand: "SoundBrand",
  description: "Crystal clear audio",
  image_url: null,
  price: "1000.00",
  discount: "100.00",
  final_price: "900.00",
  quantity: 2,
  stock: 10,
  attributes: { color: "Black" },
};

const mockSummary = {
  total_items: 2,
  total_price: "1000.00",
  total_discount: "100.00",
  final_amount: "900.00",
};

const mockEmptySummary = {
  total_items: 0,
  total_price: "0.00",
  total_discount: "0.00",
  final_amount: "0.00",
};

const mockProductDetail = {
  product_id: "prod-1",
  slug: "wireless-headphones",
  product_name: "Wireless Headphones",
  brand: "SoundBrand",
  description: "Crystal clear audio",
  category: { category_id: "cat-1", category_name: "Electronics" },
  variants: [
    {
      product_variant_id: "variant-1",
      sku: "WH-BLK-001",
      price: "1000.00",
      discount: "100.00",
      stock: 10,
      attributes: { color: "Black" },
      images: [
        {
          image_url: null,
          alt_text: null,
          is_primary: true,
          sort_order: 0,
        },
      ],
    },
  ],
};

// ---- Setup helpers ----

/**
 * Sets up a standard authenticated session: /auth/me returns the user profile
 * and /cart returns the provided items/summary on GET.
 */
async function setupAuthenticatedSession(
  page: Page,
  options: {
    cartItems?: typeof mockCartItem[];
    cartSummary?: typeof mockSummary | typeof mockEmptySummary;
  } = {},
) {
  const { cartItems = [mockCartItem], cartSummary = mockSummary } = options;

  await page.route(`${API_URL}/auth/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUser),
    });
  });

  await page.route(`${API_URL}/cart`, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ summary: cartSummary, items: cartItems }),
      });
    } else {
      await route.continue();
    }
  });
}

// ---- Redirect / access control ----

test.describe("Cart page — access control", () => {
  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 401,
          message: "Unauthorized",
          error: "Unauthorized",
        }),
      });
    });

    await page.goto("/cart");
    await expect(page).toHaveURL("/login");
  });
});

// ---- Empty cart state ----

test.describe("Cart page — empty cart", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page, {
      cartItems: [],
      cartSummary: mockEmptySummary,
    });
  });

  test("shows 'Your Cart is empty' heading", async ({ page }) => {
    await page.goto("/cart");
    await expect(
      page.getByRole("heading", { name: "Your Cart is empty" }),
    ).toBeVisible();
  });

  test("does NOT show PRICE DETAILS panel", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByText("PRICE DETAILS")).not.toBeVisible();
  });

  test("does NOT show CHECKOUT button", async ({ page }) => {
    await page.goto("/cart");
    await expect(
      page.getByRole("button", { name: "CHECKOUT" }),
    ).not.toBeVisible();
  });

  test("navbar badge is absent when cart is empty (0 items)", async ({
    page,
  }) => {
    await page.goto("/cart");
    // The badge span is only rendered when cartCount > 0
    // Use the cart link as scope: the badge <span> inside [aria-label="Cart"]
    await expect(
      page.getByRole("link", { name: "Cart" }).locator("span"),
    ).not.toBeVisible();
  });

  test("renders the empty cart SVG illustration", async ({ page }) => {
    await page.goto("/cart");
    await expect(
      page.getByRole("img", { name: "An empty shopping cart" }),
    ).toBeVisible();
  });
});

// ---- Populated cart state ----

test.describe("Cart page — populated cart", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("shows 'Shopping Cart' heading", async ({ page }) => {
    await page.goto("/cart");
    await expect(
      page.getByRole("heading", { name: "Shopping Cart" }),
    ).toBeVisible();
  });

  test("renders product name in the cart item card", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByText("Wireless Headphones")).toBeVisible();
  });

  test("renders brand in the cart item card", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByText("SoundBrand")).toBeVisible();
  });

  test("renders attribute pills", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByText("color:Black")).toBeVisible();
  });

  test("renders 'In Stock' for an in-stock item", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByText("In Stock")).toBeVisible();
  });

  test("renders the current quantity", async ({ page }) => {
    await page.goto("/cart");
    // quantity = 2, scoped to the stepper span
    await expect(page.locator('[class*="quantity"]')).toHaveText("2");
  });

  test("renders PRICE DETAILS heading in the summary panel", async ({
    page,
  }) => {
    await page.goto("/cart");
    await expect(page.getByText("PRICE DETAILS")).toBeVisible();
  });

  test("renders the CHECKOUT button", async ({ page }) => {
    await page.goto("/cart");
    await expect(
      page.getByRole("button", { name: "CHECKOUT" }),
    ).toBeVisible();
  });

  test("renders the 'Remove Item' button for each cart item", async ({
    page,
  }) => {
    await page.goto("/cart");
    // The remove row text button
    await expect(page.getByText("Remove Item")).toBeVisible();
  });

  test("renders savings message when discount > 0", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByText(/You will save/)).toBeVisible();
  });

  test("navbar badge shows total_items count", async ({ page }) => {
    await page.goto("/cart");
    // total_items = 2; scope badge to the cart link to avoid matching other "2" text
    await expect(
      page.getByRole("link", { name: "Cart" }).locator("span"),
    ).toHaveText("2");
  });
});

// ---- Quantity stepper behaviour ----

test.describe("Cart page — quantity stepper", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("+ button is visible and enabled when qty < stock", async ({ page }) => {
    await page.goto("/cart");
    const increaseBtn = page.getByRole("button", { name: "Increase quantity" });
    await expect(increaseBtn).toBeVisible();
    await expect(increaseBtn).not.toBeDisabled();
  });

  test("- button is visible when qty > 1", async ({ page }) => {
    await page.goto("/cart"); // mockItem has quantity=2
    const decreaseBtn = page.getByRole("button", { name: "Decrease quantity" });
    await expect(decreaseBtn).toBeVisible();
    await expect(decreaseBtn).not.toBeDisabled();
  });

  test("+ button is disabled when qty equals stock", async ({ page }) => {
    await page.route(`${API_URL}/cart`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            summary: mockSummary,
            items: [{ ...mockCartItem, quantity: 10, stock: 10 }],
          }),
        });
      }
    });

    await page.goto("/cart");
    const increaseBtn = page.getByRole("button", { name: "Increase quantity" });
    await expect(increaseBtn).toBeDisabled();
  });

  test("trash icon shown instead of − when qty is 1", async ({ page }) => {
    await page.route(`${API_URL}/cart`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            summary: { ...mockSummary, total_items: 1 },
            items: [{ ...mockCartItem, quantity: 1 }],
          }),
        });
      }
    });

    await page.goto("/cart");
    // At qty=1, the − button is replaced by a trash icon (aria-label="Remove item")
    // AND the remove-row button (text "Remove Item") is also present.
    // Verify the Decrease quantity button is NOT present (that is the intent)
    await expect(
      page.getByRole("button", { name: "Decrease quantity" }),
    ).not.toBeVisible();
    // The stepper trash button: aria-label="Remove item" (lowercase 'i')
    // There are TWO "remove" buttons (stepper + row), so use first() explicitly
    const stepperTrashBtn = page
      .getByRole("button", { name: "Remove item" })
      .first();
    await expect(stepperTrashBtn).toBeVisible();
  });

  test("clicking + sends PATCH request with quantity+1", async ({ page }) => {
    // Register the PATCH handler for the specific cart item
    let patchBody: Record<string, unknown> | null = null;
    await page.route(`${API_URL}/cart/item-1`, async (route) => {
      if (route.request().method() === "PATCH") {
        patchBody = JSON.parse(route.request().postData() ?? "{}") as Record<
          string,
          unknown
        >;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Cart updated",
            item: { ...mockCartItem, quantity: 3 },
            summary: { ...mockSummary, total_items: 3 },
          }),
        });
      }
    });

    await page.goto("/cart");
    // Ensure the + button is present and enabled before clicking
    const increaseBtn = page.getByRole("button", { name: "Increase quantity" });
    await expect(increaseBtn).toBeEnabled();

    // Set up waitForResponse BEFORE the click to avoid missing the response
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/cart/item-1") && response.status() === 200,
    );
    await increaseBtn.click();
    await responsePromise;

    expect(patchBody).toMatchObject({ quantity: 3 });
  });

  test("clicking − sends PATCH request with quantity-1", async ({ page }) => {
    let patchBody: Record<string, unknown> | null = null;
    await page.route(`${API_URL}/cart/item-1`, async (route) => {
      if (route.request().method() === "PATCH") {
        patchBody = JSON.parse(route.request().postData() ?? "{}") as Record<
          string,
          unknown
        >;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Cart updated",
            item: { ...mockCartItem, quantity: 1 },
            summary: { ...mockSummary, total_items: 1 },
          }),
        });
      }
    });

    await page.goto("/cart");
    const decreaseBtn = page.getByRole("button", { name: "Decrease quantity" });
    await expect(decreaseBtn).toBeEnabled();

    // Set up waitForResponse BEFORE the click
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/cart/item-1") && response.status() === 200,
    );
    await decreaseBtn.click();
    await responsePromise;

    expect(patchBody).toMatchObject({ quantity: 1 });
  });
});

// ---- Remove item flow ----

test.describe("Cart page — remove item", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("clicking 'Remove Item' sends DELETE request", async ({ page }) => {
    let deleteWasCalled = false;

    // Handle the DELETE for the specific item
    await page.route(`${API_URL}/cart/item-1`, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteWasCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Item removed from cart" }),
        });
      }
    });

    // beforeEach handler returns populated cart � no GET override needed here.

    await page.goto("/cart");
    await expect(page.getByText("Wireless Headphones")).toBeVisible();

    // Set up waitForResponse BEFORE the click
    const deleteResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/cart/item-1") &&
        response.request().method() === "DELETE",
    );
    await page.getByText("Remove Item").click();
    await deleteResponsePromise;

    expect(deleteWasCalled).toBe(true);
  });

  test("cart transitions to empty state after last item is removed", async ({
    page,
  }) => {
    // Use a flag (not a counter) to survive React StrictMode double-invoking
    // effects which can fire GET /cart multiple times before the user interacts.
    let itemRemoved = false;

    await page.route(`${API_URL}/cart/item-1`, async (route) => {
      if (route.request().method() === "DELETE") {
        itemRemoved = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Item removed from cart" }),
        });
      }
    });

    // Override GET /cart: populated until removed, empty afterward
    await page.route(`${API_URL}/cart`, async (route) => {
      if (route.request().method() === "GET") {
        if (itemRemoved) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ summary: mockEmptySummary, items: [] }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              summary: mockSummary,
              items: [mockCartItem],
            }),
          });
        }
      } else {
        await route.continue();
      }
    });

    await page.goto("/cart");
    await expect(page.getByText("Wireless Headphones")).toBeVisible();

    await page.getByText("Remove Item").click();

    await expect(
      page.getByRole("heading", { name: "Your Cart is empty" }),
    ).toBeVisible({ timeout: 8000 });
  });
});

// ---- Add to Cart from Product Detail page ----

test.describe("Product Detail page — Add to Cart", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      });
    });

    await page.route(`${API_URL}/cart`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ summary: mockEmptySummary, items: [] }),
        });
      } else if (method === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            item: { ...mockCartItem, quantity: 1 },
            summary: {
              total_items: 1,
              total_price: "1000.00",
              total_discount: "100.00",
              final_amount: "900.00",
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(
      `${API_URL}/product/detail/wireless-headphones`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockProductDetail),
        });
      },
    );
  });

  test("'Add to Cart' button is visible on product detail page", async ({
    page,
  }) => {
    await page.goto("/product/detail/wireless-headphones");
    await expect(
      page.getByRole("button", { name: "Add to Cart" }),
    ).toBeVisible();
  });

  test("clicking 'Add to Cart' sends POST /cart request", async ({ page }) => {
    let postBody: Record<string, unknown> | null = null;

    // Override the beforeEach POST handler with one that captures the body
    await page.route(`${API_URL}/cart`, async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        postBody = JSON.parse(route.request().postData() ?? "{}") as Record<
          string,
          unknown
        >;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            item: { ...mockCartItem, quantity: 1 },
            summary: {
              total_items: 1,
              total_price: "1000.00",
              total_discount: "100.00",
              final_amount: "900.00",
            },
          }),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ summary: mockEmptySummary, items: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/product/detail/wireless-headphones");
    await expect(
      page.getByRole("button", { name: "Add to Cart" }),
    ).toBeEnabled();

    // Set up waitForResponse BEFORE clicking
    const postResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${API_URL}/cart` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Add to Cart" }).click();
    await postResponsePromise;

    expect(postBody).toMatchObject({ product_variant_id: "variant-1" });
  });

  test("shows success toast after adding to cart", async ({ page }) => {
    await page.goto("/product/detail/wireless-headphones");

    await page.getByRole("button", { name: "Add to Cart" }).click();

    await expect(page.getByText("Added to cart")).toBeVisible({
      timeout: 5000,
    });
  });

  test("navbar badge increments after successful add-to-cart", async ({
    page,
  }) => {
    await page.goto("/product/detail/wireless-headphones");

    // Before add: badge should not be visible (0 items → no span rendered)
    await expect(
      page.getByRole("link", { name: "Cart" }).locator("span"),
    ).not.toBeVisible();

    await page.getByRole("button", { name: "Add to Cart" }).click();

    // After add: summary.total_items = 1, badge should show "1"
    // Scope to the cart link badge span to avoid strict mode violations
    await expect(
      page.getByRole("link", { name: "Cart" }).locator("span"),
    ).toHaveText("1", { timeout: 5000 });
  });

  test("shows error toast when cart is full (400 cartFull)", async ({
    page,
  }) => {
    // Override just the POST handler (LIFO — fires before beforeEach GET handler)
    await page.route(`${API_URL}/cart`, async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 400,
            message: "Cart is full. Checkout or remove an item first.",
            error: "Bad Request",
          }),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ summary: mockSummary, items: [mockCartItem] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/product/detail/wireless-headphones");
    await page.getByRole("button", { name: "Add to Cart" }).click();

    await expect(
      page.getByText("Cart is full. Checkout or remove an item first."),
    ).toBeVisible({ timeout: 5000 });
  });

  test("'Add to Cart' button is disabled while add is in flight", async ({
    page,
  }) => {
    let resolvePost!: () => void;
    const postPending = new Promise<void>((r) => {
      resolvePost = r;
    });

    // Override POST to be slow
    await page.route(`${API_URL}/cart`, async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        await postPending;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            item: { ...mockCartItem, quantity: 1 },
            summary: {
              total_items: 1,
              total_price: "1000.00",
              total_discount: "100.00",
              final_amount: "900.00",
            },
          }),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ summary: mockEmptySummary, items: [] }),
        });
      }
    });

    await page.goto("/product/detail/wireless-headphones");
    await page.getByRole("button", { name: "Add to Cart" }).click();

    await expect(
      page.getByRole("button", { name: "Add to Cart" }),
    ).toBeDisabled();
    resolvePost();
  });
});

// ---- API error handling ----

test.describe("Cart page — API error handling", () => {
  test("shows error message when GET /cart fails", async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      });
    });

    await page.route(`${API_URL}/cart`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 500,
            message: "Internal server error",
            error: "Internal Server Error",
          }),
        });
      }
    });

    await page.goto("/cart");

    await expect(page.getByText("Internal server error")).toBeVisible({
      timeout: 5000,
    });
  });

  test("shows error toast when update qty fails (stock exceeded)", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);
    await page.route(`${API_URL}/cart/item-1`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 400,
            message: "Quantity exceeds available stock",
            error: "Bad Request",
          }),
        });
      }
    });

    await page.goto("/cart");

    const patchResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/cart/item-1") && response.status() === 400,
    );
    await page.getByRole("button", { name: "Increase quantity" }).click();
    await patchResponsePromise;

    await expect(
      page.getByText("Quantity exceeds available stock"),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---- Responsive layout ----

test.describe("Cart page — responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("renders correctly at desktop width (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/cart");

    await expect(
      page.getByRole("heading", { name: "Shopping Cart" }),
    ).toBeVisible();
    await expect(page.getByText("PRICE DETAILS")).toBeVisible();
  });

  test("renders correctly at tablet width (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/cart");

    await expect(
      page.getByRole("heading", { name: "Shopping Cart" }),
    ).toBeVisible();
  });

  test("renders correctly at mobile width (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/cart");

    await expect(
      page.getByRole("heading", { name: "Shopping Cart" }),
    ).toBeVisible();
  });
});

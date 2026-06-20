/**
 * Home Page E2E tests — Playwright.
 *
 * The home page is a purely static component (no backend fetch). It sits
 * behind `RequireAuth`, so every test mocks:
 *   - GET /auth/me  → 200 (authenticated user)
 *   - GET /cart     → 200 empty cart (prevents authExpiryMiddleware redirect)
 *
 * Only these two mocks are needed — there are no product or user API calls on
 * this page. Navigation is verified via `expect(page).toHaveURL()` because a
 * real browser test can confirm the react-router state change in a way RTL
 * (which uses a MemoryRouter) cannot.
 *
 * Because the card images are external Flixcart CDN URLs they may not load in
 * the test environment; we therefore assert on the button/section structure
 * and aria-labels rather than image load state.
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

// ---- Setup helpers ----

/**
 * Mocks /auth/me and /cart so RequireAuth passes and MainLayout's fetchCart
 * does not trigger authExpiryMiddleware → sessionExpired → redirect to /login.
 */
async function setupAuthenticatedSession(page: Page) {
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

test.describe("Home page — access control", () => {
  test("unauthenticated user visiting / is redirected to /login", async ({
    page,
  }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized" }),
      });
    });

    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });
});

// ---- Banner ----

test.describe("Home page — banner", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("renders the hero banner image", async ({ page }) => {
    await page.goto("/");
    // The banner <img> has alt="Discover everything you love, faster."
    await expect(
      page.getByAltText("Discover everything you love, faster."),
    ).toBeVisible({ timeout: 10000 });
  });

  test("renders the 'Start finding products' hotspot button", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Start finding products" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("renders the 'Browse all categories' hotspot button", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Browse all categories" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("clicking 'Start finding products' navigates to /product/All", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector("[aria-label='Start finding products']");
    await page.getByRole("button", { name: "Start finding products" }).click();
    await expect(page).toHaveURL("/product/All");
  });

  test("clicking 'Browse all categories' navigates to /product/All", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector("[aria-label='Browse all categories']");
    await page.getByRole("button", { name: "Browse all categories" }).click();
    await expect(page).toHaveURL("/product/All");
  });
});

// ---- Section headings ----

test.describe("Home page — section headings", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("renders all five section headings", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Popular Picks")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Wear Your Favourite Team")).toBeVisible();
    await expect(page.getByText("Style in Motion")).toBeVisible();
    await expect(page.getByText("Mobiles")).toBeVisible();
    await expect(page.getByText("Laptops")).toBeVisible();
  });
});

// ---- Card count ----

test.describe("Home page — product cards", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("renders exactly 25 product card buttons (5 per section × 5 sections)", async ({
    page,
  }) => {
    await page.goto("/");
    // Wait for the page content to fully render.
    await expect(page.getByText("Popular Picks")).toBeVisible({
      timeout: 10000,
    });

    // All product card buttons carry aria-labels containing "— shop ".
    // The two banner hotspot buttons do not contain this substring.
    const cardButtons = page.locator(
      'button[aria-label*="— shop "]',
    );
    await expect(cardButtons).toHaveCount(25);
  });

  test("clicking a Mobiles card navigates to /product/mobile-phones", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Mobiles")).toBeVisible({ timeout: 10000 });

    // Click the first card in the Mobiles section.
    const firstMobilesCard = page
      .locator('button[aria-label*="shop mobile-phones"]')
      .first();
    await firstMobilesCard.click();
    await expect(page).toHaveURL("/product/mobile-phones");
  });

  test("clicking a Laptops card navigates to /product/laptops", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Laptops")).toBeVisible({ timeout: 10000 });

    const firstLaptopsCard = page
      .locator('button[aria-label*="shop laptops"]')
      .first();
    await firstLaptopsCard.click();
    await expect(page).toHaveURL("/product/laptops");
  });

  test("clicking a footwear card in Style in Motion navigates to /product/footwear", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Style in Motion")).toBeVisible({
      timeout: 10000,
    });

    // The Style in Motion section has two footwear cards (Crocs + Shoes).
    const footwearCard = page
      .locator('button[aria-label*="shop footwear"]')
      .first();
    await footwearCard.click();
    await expect(page).toHaveURL("/product/footwear");
  });

  test("clicking a Popular Picks clothing card navigates to /product/clothing", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Popular Picks")).toBeVisible({
      timeout: 10000,
    });

    // Popular Picks has 5 cards, all with category=clothing.
    const firstCard = page
      .locator('button[aria-label*="shop clothing"]')
      .first();
    await firstCard.click();
    await expect(page).toHaveURL("/product/clothing");
  });
});

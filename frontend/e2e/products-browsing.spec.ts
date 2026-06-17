import { test, expect } from "@playwright/test";

const API_URL = "http://localhost:3000";

const mockProducts = [
  {
    product_id: "prod-1",
    product_name: "Blue Denim Jacket",
    slug: "blue-denim-jacket",
    brand: "Levi's",
    description: "Classic denim jacket",
    price: "2999.00",
    discount: "300.00",
    image_url: null,
    category_slug: "fashion",
  },
  {
    product_id: "prod-2",
    product_name: "Running Shoes",
    slug: "running-shoes",
    brand: "Nike",
    description: "Lightweight running shoes",
    price: "4999.00",
    discount: "0.00",
    image_url: null,
    category_slug: "fashion",
  },
];

const mockFilters = {
  price: { min: "999.00", max: "5999.00" },
  attributes: [
    { name: "color", label: "Color", values: ["Blue", "Black", "Red"] },
    { name: "size", label: "Size", values: ["S", "M", "L"] },
  ],
};

async function setupAuthSession(page: import("@playwright/test").Page) {
  await page.route(`${API_URL}/auth/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "user-1",
        email: "jane@example.com",
        first_name: "Jane",
        last_name: "Doe",
        user_name: "janedoe",
      }),
    });
  });
}

/**
 * Mocks all product API routes using a wildcard pattern that distinguishes
 * filters vs. list requests by inspecting the URL inside the handler.
 *
 * The wildcard `${API_URL}/product/**` intercepts all requests whose URL begins
 * with the API origin + /product/, including:
 *   - /product/All          (list with no query params)
 *   - /product/All?page=2   (list with query params)
 *   - /product/All/filters  (filters/facets endpoint)
 */
async function setupProductListRoutes(
  page: import("@playwright/test").Page,
  products = mockProducts,
  totalPages = 1,
) {
  await page.route(`${API_URL}/product/**`, async (route) => {
    const url = route.request().url();
    if (url.includes("/filters")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFilters),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: products,
          meta: { page: 1, limit: 12, total: products.length, total_pages: totalPages },
        }),
      });
    }
  });
}

test.describe("Products listing page — rendering", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthSession(page);
    await setupProductListRoutes(page);
  });

  test("renders the Products heading", async ({ page }) => {
    await page.goto("/product/All");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  });

  test("renders the filter sidebar with Filters heading", async ({ page }) => {
    await page.goto("/product/All");
    await expect(page.getByRole("heading", { name: "Filters" })).toBeVisible();
  });

  test("displays product cards after data loads", async ({ page }) => {
    await page.goto("/product/All");
    // Use role-based selectors to find product cards by their h3 heading text
    await expect(page.getByRole("heading", { name: "Blue Denim Jacket", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Running Shoes", level: 3 })).toBeVisible();
  });

  test("displays product brand names", async ({ page }) => {
    await page.goto("/product/All");
    await expect(page.getByText("Levi's", { exact: true })).toBeVisible();
    await expect(page.getByText("Nike", { exact: true })).toBeVisible();
  });

  test("displays formatted prices", async ({ page }) => {
    await page.goto("/product/All");
    await expect(page.getByText(/₹2,999/)).toBeVisible();
    await expect(page.getByText(/₹4,999/)).toBeVisible();
  });

  test("displays discount badge for products with discounts", async ({ page }) => {
    await page.goto("/product/All");
    // 300/2999 = ~10%
    await expect(page.getByText("10 % off")).toBeVisible();
  });

  test("does not show discount badge for products with no discount", async ({ page }) => {
    await page.goto("/product/All");
    // Wait for products to load first
    await expect(page.getByRole("heading", { name: "Running Shoes", level: 3 })).toBeVisible();
    // Only 1 badge should exist (for the denim jacket)
    const badgeTexts = await page.getByText(/% off/).all();
    expect(badgeTexts).toHaveLength(1);
  });
});

test.describe("Products listing — loading and error states", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthSession(page);
  });

  test("shows loading state while products are being fetched", async ({ page }) => {
    let resolveProducts!: (value: unknown) => void;
    const productsPending = new Promise((r) => { resolveProducts = r; });

    await page.route(`${API_URL}/product/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/filters")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockFilters),
        });
      } else {
        await productsPending;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], meta: { page: 1, limit: 12, total: 0, total_pages: 0 } }),
        });
      }
    });

    await page.goto("/product/All");
    await expect(page.getByText("Loading…")).toBeVisible();
    resolveProducts(undefined);
  });

  test("shows empty results message when no products match", async ({ page }) => {
    await page.route(`${API_URL}/product/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/filters")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockFilters),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], meta: { page: 1, limit: 12, total: 0, total_pages: 0 } }),
        });
      }
    });

    await page.goto("/product/All");
    await expect(page.getByText("No products found")).toBeVisible();
  });

  test("shows error message on API failure", async ({ page }) => {
    await page.route(`${API_URL}/product/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/filters")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockFilters),
        });
      } else {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ statusCode: 500, message: "Internal server error" }),
        });
      }
    });

    await page.goto("/product/All");
    await expect(page.getByText("Internal server error")).toBeVisible();
  });
});

test.describe("Products listing — filter sidebar interactions", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthSession(page);
    await setupProductListRoutes(page);
  });

  test("renders price range slider in filter sidebar", async ({ page }) => {
    await page.goto("/product/All");
    await expect(page.getByRole("heading", { name: "Price Range" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Maximum price" })).toBeVisible();
  });

  test("renders attribute facet pills", async ({ page }) => {
    await page.goto("/product/All");
    // Use exact match and look within the filter sidebar to avoid matching the product card button
    const sidebar = page.getByRole("complementary", { name: "Product filters" });
    await expect(sidebar.getByRole("button", { name: "Blue", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "M", exact: true })).toBeVisible();
  });

  test("toggling a facet updates the URL query string", async ({ page }) => {
    await page.goto("/product/All");
    await page.waitForSelector('[aria-label="Product filters"]');
    const sidebar = page.getByRole("complementary", { name: "Product filters" });
    await sidebar.getByRole("button", { name: "Blue", exact: true }).click();

    await expect(page).toHaveURL(/attributes=/);
  });

  test("Clear filters button appears after selecting a facet", async ({ page }) => {
    await page.goto("/product/All");
    await page.waitForSelector('[aria-label="Product filters"]');
    const sidebar = page.getByRole("complementary", { name: "Product filters" });
    await sidebar.getByRole("button", { name: "Blue", exact: true }).click();

    await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();
  });

  test("clicking Clear filters removes the attributes from URL", async ({ page }) => {
    await page.goto(
      '/product/All?attributes=%7B%22color%22%3A%5B%22Blue%22%5D%7D',
    );

    await page.waitForSelector('[aria-label="Product filters"]');
    await page.getByRole("button", { name: "Clear filters" }).click();

    await expect(page).not.toHaveURL(/attributes=/);
  });
});

test.describe("Products listing — navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthSession(page);
    await setupProductListRoutes(page);
  });

  test("clicking a product card navigates to product detail page", async ({ page }) => {
    const mockDetail = {
      product_id: "prod-1",
      product_name: "Blue Denim Jacket",
      slug: "blue-denim-jacket",
      brand: "Levi's",
      description: "Classic denim jacket",
      category: { category_id: "cat-1", category_name: "Fashion", slug: "fashion" },
      variants: [
        {
          product_variant_id: "var-1",
          sku: "BDJ-S-BLU",
          stock: 10,
          price: "2999.00",
          discount: "300.00",
          attributes: { color: "blue", size: "S" },
          images: [],
        },
      ],
    };

    await page.route(`${API_URL}/product/detail/blue-denim-jacket`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDetail),
      });
    });

    await page.goto("/product/All");
    // Click the product card button (which contains the product name)
    await page.getByRole("heading", { name: "Blue Denim Jacket", level: 3 }).click();

    await expect(page).toHaveURL(/\/product\/detail\/blue-denim-jacket/);
  });
});

test.describe("Products listing — pagination", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthSession(page);
  });

  test("renders pagination controls when multiple pages exist", async ({ page }) => {
    await page.route(`${API_URL}/product/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/filters")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockFilters),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: mockProducts, meta: { page: 1, limit: 12, total: 36, total_pages: 3 } }),
        });
      }
    });

    await page.goto("/product/All");
    await expect(page.getByText("Next")).toBeVisible();
    await expect(page.getByText("Prev")).toBeVisible();
  });

  test("does not render pagination for a single page", async ({ page }) => {
    await page.route(`${API_URL}/product/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/filters")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockFilters),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: mockProducts, meta: { page: 1, limit: 12, total: 2, total_pages: 1 } }),
        });
      }
    });

    await page.goto("/product/All");
    await expect(page.getByRole("heading", { name: "Blue Denim Jacket", level: 3 })).toBeVisible();
    await expect(page.getByText("Next")).not.toBeVisible();
  });

  test("clicking next page updates the URL page parameter", async ({ page }) => {
    await page.route(`${API_URL}/product/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/filters")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockFilters),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: mockProducts, meta: { page: 1, limit: 12, total: 36, total_pages: 3 } }),
        });
      }
    });

    await page.goto("/product/All");
    await page.getByText("Next").click();
    await expect(page).toHaveURL(/page=2/);
  });
});

test.describe("Products listing — responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthSession(page);
    await setupProductListRoutes(page);
  });

  test("renders correctly at desktop width (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/product/All");
    await expect(page.getByRole("heading", { name: "Filters" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  });

  test("renders correctly at tablet width (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/product/All");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  });

  test("renders correctly at mobile width (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/product/All");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  });
});

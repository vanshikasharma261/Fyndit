import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Address Feature E2E tests — Playwright.
 *
 * Follows the established cart.spec.ts / user-profile.spec.ts pattern:
 * - Anchor all page.route() calls to the API origin (http://localhost:3000)
 *   to avoid intercepting Vite dev-server navigation requests.
 * - Mock /auth/me, /user, and /cart in every authenticated-session setup.
 *   The MainLayout dispatches fetchCart on mount; without a real session
 *   cookie the live backend returns 401, which fires authExpiryMiddleware →
 *   sessionExpired → redirect to /login. Mocking /cart prevents this.
 * - Always set up page.waitForResponse() BEFORE the action that triggers the
 *   request — never after the click.
 * - Use flag-based GET /address state transitions rather than call counters to
 *   survive React StrictMode double-invoking effects.
 */

const API_URL = "http://localhost:3000";

/** Shared address shape used in fixtures — line2 is string | null. */
interface MockAddress {
  address_id: string;
  address_type: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  zip: string;
  is_default: boolean;
}

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

const mockDefaultAddress: MockAddress = {
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

const mockNonDefaultAddress: MockAddress = {
  address_id: "addr-2",
  address_type: "WORK",
  line1: "456 Office Rd",
  line2: "Suite 200",
  city: "Pune",
  state: "Maharashtra",
  country: "India",
  zip: "411001",
  is_default: false,
};

const updatedAddress: MockAddress = {
  ...mockDefaultAddress,
  line1: "789 New St",
  city: "Delhi",
};

// ---- Setup helpers ----

/**
 * Sets up a standard authenticated session: /auth/me returns the user profile,
 * /user returns the full profile, and /cart returns an empty cart.
 *
 * The /cart mock is essential: MainLayout dispatches fetchCart on mount and
 * without a real session cookie the live backend returns 401, triggering
 * authExpiryMiddleware → sessionExpired → redirect to /login.
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

  // Prevent MainLayout's fetchCart from hitting the live backend (no real cookie).
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

/**
 * Sets up GET /address to return the given address list.
 */
async function setupAddressRoute(
  page: Page,
  addresses: MockAddress[],
) {
  await page.route(`${API_URL}/address`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(addresses),
      });
    } else {
      await route.continue();
    }
  });
}

// ---- Access control ----

test.describe("Profile/Addresses — access control", () => {
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

    await page.goto("/profile");
    await expect(page).toHaveURL("/login");
  });
});

// ---- Addresses panel — empty state ----

test.describe("Addresses panel — empty state", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupAddressRoute(page, []);
  });

  test("navigating to /profile shows the Addresses heading", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "Addresses" }),
    ).toBeVisible();
  });

  test("shows empty state message when no addresses are saved", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page.getByText("No addresses saved yet.")).toBeVisible();
  });

  test("shows 'Add Address' button when no addresses exist", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(
      page.getByRole("button", { name: /Add Address/i }),
    ).toBeVisible();
  });
});

// ---- Addresses panel — list with addresses ----

test.describe("Addresses panel — populated list", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupAddressRoute(page, [mockDefaultAddress, mockNonDefaultAddress]);
  });

  test("shows the address line1 for each address", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("123 Main St")).toBeVisible();
    await expect(page.getByText("456 Office Rd")).toBeVisible();
  });

  test("shows 'Default' badge on the default address card", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page.getByText("Default", { exact: true }).first()).toBeVisible();
  });

  test("shows 'Set as default' button on non-default cards only", async ({
    page,
  }) => {
    await page.goto("/profile");
    // There is exactly one non-default address, so one "Set as default" button
    const buttons = page.getByRole("button", { name: /Set as default/i });
    await expect(buttons).toHaveCount(1);
  });

  test("shows address type badges (HOME and WORK)", async ({ page }) => {
    await page.goto("/profile");
    const homeBadge = page.getByText("HOME").first();
    await expect(homeBadge).toBeVisible();
    await expect(page.getByText("WORK")).toBeVisible();
  });

  test("shows line2 when present", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("Suite 200")).toBeVisible();
  });

  test("shows city, state info", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("Mumbai")).toBeVisible();
    await expect(page.getByText("Pune")).toBeVisible();
  });

  test("shows zip chip", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText(/Zip Code: 400001/)).toBeVisible();
  });
});

// ---- Address limit enforcement ----

test.describe("Addresses panel — 5-address limit", () => {
  test("hides 'Add Address' and shows limit note at 5 active addresses", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);
    const fiveAddresses = Array.from({ length: 5 }, (_, i) => ({
      address_id: `addr-${i + 1}`,
      address_type: "HOME" as const,
      line1: `${i + 1} Street`,
      line2: null,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      zip: "400001",
      is_default: i === 0,
    }));
    await setupAddressRoute(page, fiveAddresses);

    await page.goto("/profile");

    // "Add Address" button must NOT be present
    await expect(
      page.getByRole("button", { name: /Add Address/i }),
    ).not.toBeVisible();

    // Limit note must be shown
    await expect(
      page.getByText("You can save up to 5 addresses."),
    ).toBeVisible();
  });

  test("'Add Address' button is visible at 4 addresses", async ({ page }) => {
    await setupAuthenticatedSession(page);
    const fourAddresses = Array.from({ length: 4 }, (_, i) => ({
      address_id: `addr-${i + 1}`,
      address_type: "HOME" as const,
      line1: `${i + 1} Street`,
      line2: null,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      zip: "400001",
      is_default: i === 0,
    }));
    await setupAddressRoute(page, fourAddresses);

    await page.goto("/profile");
    await expect(
      page.getByRole("button", { name: /Add Address/i }),
    ).toBeVisible();
  });
});

// ---- Add address form — UI rendering ----

test.describe("AddressForm — add form rendering", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupAddressRoute(page, []);
  });

  test("opening add form shows address type pills HOME, WORK, OTHER", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: /Add Address/i }).click();

    await expect(page.getByRole("button", { name: "HOME" })).toBeVisible();
    await expect(page.getByRole("button", { name: "WORK" })).toBeVisible();
    await expect(page.getByRole("button", { name: "OTHER" })).toBeVisible();
  });

  test("HOME pill is selected by default in add mode", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: /Add Address/i }).click();

    await expect(page.getByRole("button", { name: "HOME" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("State dropdown renders INDIAN_STATES options", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: /Add Address/i }).click();

    const stateSelect = page.getByRole("combobox", { name: "State" });
    await expect(stateSelect).toBeVisible();
    // Check that a few known states are present
    await expect(
      stateSelect.locator("option", { hasText: "Maharashtra" }),
    ).toBeAttached();
    await expect(
      stateSelect.locator("option", { hasText: "Delhi" }),
    ).toBeAttached();
  });

  test("Country input is visible, fixed to India, and disabled", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: /Add Address/i }).click();

    const countryInput = page.getByLabel("Country");
    await expect(countryInput).toBeVisible();
    await expect(countryInput).toHaveValue("India");
    await expect(countryInput).toBeDisabled();
  });

  test("Cancel button in add form returns to list mode", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: /Add Address/i }).click();
    await page.getByRole("button", { name: "Cancel" }).click();

    // Back to list — Add Address button should reappear
    await expect(
      page.getByRole("button", { name: /Add Address/i }),
    ).toBeVisible();
  });
});

// ---- Add address — happy path ----

test.describe("Address CRUD — add address", () => {
  test("adds an address, sees it listed and shows success toast", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    // Flag-based GET /address transition (same pattern as cart item remove)
    let addressAdded = false;

    // Use LIFO: register address POST+GET AFTER setupAuthenticatedSession
    // (which registered the generic /cart GET). The address route uses a
    // different URL so there is no conflict.
    await page.route(`${API_URL}/address`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(addressAdded ? [mockDefaultAddress] : []),
        });
      } else if (method === "POST") {
        addressAdded = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(mockDefaultAddress),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/profile");

    // Wait for empty state, then open add form
    await expect(
      page.getByRole("button", { name: /Add Address/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Add Address/i }).click();

    // Fill in the form
    await page.getByLabel("Line 1").fill("123 Main St");
    await page.getByLabel("City").fill("Mumbai");
    await page.getByRole("combobox", { name: "State" }).selectOption("Maharashtra");
    await page.getByLabel("Zip Code").fill("400001");

    // Set up waitForResponse BEFORE clicking
    const postResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${API_URL}/address` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Add" }).click();
    await postResponsePromise;

    // Success toast
    await expect(page.getByText("Address added")).toBeVisible({
      timeout: 5000,
    });

    // Address appears in the list after re-fetch
    await expect(page.getByText("123 Main St")).toBeVisible({ timeout: 5000 });
  });
});

// ---- Edit address — happy path ----

test.describe("Address CRUD — edit address", () => {
  test("opens edit form pre-filled, submits update, shows success toast", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    let editDone = false;
    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(editDone ? [updatedAddress] : [mockDefaultAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address/addr-1`, async (route) => {
      if (route.request().method() === "PATCH") {
        editDone = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(updatedAddress),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/profile");
    await expect(page.getByText("123 Main St")).toBeVisible();

    // Open edit form
    await page.getByRole("button", { name: /Edit home address/i }).click();

    // Form should be pre-filled
    await expect(page.getByLabel("Line 1")).toHaveValue("123 Main St");

    // Edit line1 and city
    await page.getByLabel("Line 1").clear();
    await page.getByLabel("Line 1").fill("789 New St");
    await page.getByLabel("City").clear();
    await page.getByLabel("City").fill("Delhi");

    // Set up waitForResponse BEFORE clicking
    const patchResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/address/addr-1") &&
        response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Update" }).click();
    await patchResponsePromise;

    // Success toast
    await expect(page.getByText("Address updated")).toBeVisible({
      timeout: 5000,
    });
  });
});

// ---- Set default address ----

test.describe("Address CRUD — set default", () => {
  test("clicking Set as default shows success toast and updates badges", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    const refreshedList = [
      { ...mockNonDefaultAddress, is_default: true },
      { ...mockDefaultAddress, is_default: false },
    ];

    await setupAddressRoute(page, [mockDefaultAddress, mockNonDefaultAddress]);
    await page.route(`${API_URL}/address/addr-2/default`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(refreshedList),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/profile");
    await expect(
      page.getByRole("button", { name: /Set as default/i }),
    ).toBeVisible();

    const patchResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/address/addr-2/default") &&
        response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: /Set as default/i }).click();
    await patchResponsePromise;

    // Success toast
    await expect(page.getByText("Default address updated")).toBeVisible({
      timeout: 5000,
    });
  });
});

// ---- Remove address ----

test.describe("Address CRUD — remove address", () => {
  test("removes an address and shows success toast", async ({ page }) => {
    await setupAuthenticatedSession(page);

    let addressRemoved = false;

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            addressRemoved ? [] : [mockDefaultAddress],
          ),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address/addr-1`, async (route) => {
      if (route.request().method() === "DELETE") {
        addressRemoved = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Address removed" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/profile");
    await expect(page.getByText("123 Main St")).toBeVisible();

    const deleteResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/address/addr-1") &&
        response.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: /Remove home address/i }).click();
    await deleteResponsePromise;

    // Success toast
    await expect(page.getByText("Address removed")).toBeVisible({
      timeout: 5000,
    });
  });

  test("list transitions to empty after removing the last address", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    let addressRemoved = false;

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(addressRemoved ? [] : [mockDefaultAddress]),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API_URL}/address/addr-1`, async (route) => {
      if (route.request().method() === "DELETE") {
        addressRemoved = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Address removed" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/profile");
    await expect(page.getByText("123 Main St")).toBeVisible();

    await page.getByRole("button", { name: /Remove home address/i }).click();

    await expect(page.getByText("No addresses saved yet.")).toBeVisible({
      timeout: 8000,
    });
  });
});

// ---- Zip validation error — inline rendering ----

test.describe("Address form — zip validation error", () => {
  test("renders zip validation error inline (not as a toast)", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 400,
            error: "Bad Request",
            message: "Validation failed",
            errors: { zip: "Invalid Zip Code" },
          }),
        });
      } else if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/profile");
    await page.getByRole("button", { name: /Add Address/i }).click();

    await page.getByLabel("Line 1").fill("123 Main St");
    await page.getByLabel("City").fill("Mumbai");
    await page.getByRole("combobox", { name: "State" }).selectOption("Maharashtra");
    await page.getByLabel("Zip Code").fill("BADZIP");

    const postResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${API_URL}/address` &&
        response.request().method() === "POST" &&
        response.status() === 400,
    );
    await page.getByRole("button", { name: "Add" }).click();
    await postResponsePromise;

    // The inline validation error renders beneath the zip field
    await expect(page.getByText(/Invalid Zip Code/)).toBeVisible({
      timeout: 5000,
    });

    // The form is still open (no navigation)
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible();

    // No success toast on validation error
    await expect(page.getByText("Address added")).not.toBeVisible();
  });

  test("zip input has aria-invalid=true when validation error is set", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 400,
            error: "Bad Request",
            message: "Validation failed",
            errors: { zip: "Invalid Zip Code" },
          }),
        });
      } else if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/profile");
    await page.getByRole("button", { name: /Add Address/i }).click();

    await page.getByLabel("Line 1").fill("123 Main St");
    await page.getByLabel("City").fill("Mumbai");
    await page.getByRole("combobox", { name: "State" }).selectOption("Maharashtra");
    await page.getByLabel("Zip Code").fill("BAD");

    const postResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${API_URL}/address` &&
        response.request().method() === "POST" &&
        response.status() === 400,
    );
    await page.getByRole("button", { name: "Add" }).click();
    await postResponsePromise;

    await expect(page.getByLabel("Zip Code")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

// ---- API error handling ----

test.describe("Addresses — API error handling", () => {
  test("shows error toast when a non-validation POST /address fails", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);

    await page.route(`${API_URL}/address`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 500,
            error: "Internal Server Error",
            message: "Unexpected error occurred",
          }),
        });
      } else if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/profile");
    await page.getByRole("button", { name: /Add Address/i }).click();

    await page.getByLabel("Line 1").fill("123 Main St");
    await page.getByLabel("City").fill("Mumbai");
    await page.getByRole("combobox", { name: "State" }).selectOption("Maharashtra");
    await page.getByLabel("Zip Code").fill("400001");

    await page.getByRole("button", { name: "Add" }).click();

    await expect(
      page.getByText("Unexpected error occurred"),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ---- Navigation ----

test.describe("Addresses — navigation", () => {
  test("profile page is accessible at /profile when authenticated", async ({
    page,
  }) => {
    await setupAuthenticatedSession(page);
    await setupAddressRoute(page, []);

    await page.goto("/profile");
    await expect(page).toHaveURL("/profile");
    await expect(
      page.getByRole("heading", { name: "Addresses" }),
    ).toBeVisible();
  });
});

// ---- Responsive layout ----

test.describe("Addresses panel — responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
    await setupAddressRoute(page, [mockDefaultAddress]);
  });

  test("renders correctly at desktop width (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "Addresses" }),
    ).toBeVisible();
    await expect(page.getByText("123 Main St")).toBeVisible();
  });

  test("renders correctly at tablet width (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "Addresses" }),
    ).toBeVisible();
  });

  test("renders correctly at mobile width (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "Addresses" }),
    ).toBeVisible();
  });
});

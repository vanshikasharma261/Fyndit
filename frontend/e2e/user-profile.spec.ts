import { test, expect } from "@playwright/test";

const API_URL = "http://localhost:3000";

const mockUserProfile = {
  id: "user-1",
  email: "jane@example.com",
  first_name: "Jane",
  last_name: "Doe",
  user_name: "janedoe",
  phone: "9876543210",
};

/**
 * Sets up a mock authenticated session: /auth/me returns the user profile
 * and /user returns the full profile with phone.
 */
async function setupAuthenticatedSession(page: import("@playwright/test").Page) {
  await page.route(`${API_URL}/auth/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: mockUserProfile.id,
        email: mockUserProfile.email,
        first_name: mockUserProfile.first_name,
        last_name: mockUserProfile.last_name,
        user_name: mockUserProfile.user_name,
      }),
    });
  });

  await page.route(`${API_URL}/user`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUserProfile),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe("Profile page — rendering", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("renders the Manage Your Profile card", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Manage Your Profile" })).toBeVisible();
  });

  test("renders the Addresses card", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Addresses" })).toBeVisible();
  });

  test("displays user profile data after load", async ({ page }) => {
    await page.goto("/profile");

    // Use exact match to avoid strict mode violations from substring matches
    await expect(page.getByText("Jane", { exact: true })).toBeVisible();
    await expect(page.getByText("Doe", { exact: true })).toBeVisible();
    await expect(page.getByText("janedoe", { exact: true })).toBeVisible();
    await expect(page.getByText("jane@example.com", { exact: true })).toBeVisible();
    await expect(page.getByText("9876543210", { exact: true })).toBeVisible();
  });

  test("shows all five profile field labels", async ({ page }) => {
    await page.goto("/profile");

    await expect(page.getByText("First Name:")).toBeVisible();
    await expect(page.getByText("Last Name:")).toBeVisible();
    await expect(page.getByText("User Name:")).toBeVisible();
    await expect(page.getByText("Email:")).toBeVisible();
    await expect(page.getByText("Phone:")).toBeVisible();
  });

  test("each field has an edit button", async ({ page }) => {
    await page.goto("/profile");

    await expect(page.getByRole("button", { name: "Edit First Name" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Phone" })).toBeVisible();
  });

  test("shows 'Address management is coming soon.' note", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("Address management is coming soon.")).toBeVisible();
  });
});

test.describe("Profile page — inline editing", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("clicking edit button opens inline text input", async ({ page }) => {
    await page.goto("/profile");

    await page.getByRole("button", { name: "Edit First Name" }).click();
    await expect(page.getByRole("textbox", { name: "First Name" })).toBeVisible();
  });

  test("inline input is pre-populated with current value", async ({ page }) => {
    await page.goto("/profile");

    await page.getByRole("button", { name: "Edit First Name" }).click();
    await expect(page.getByRole("textbox", { name: "First Name" })).toHaveValue("Jane");
  });

  test("save button appears when editing", async ({ page }) => {
    await page.goto("/profile");

    await page.getByRole("button", { name: "Edit First Name" }).click();
    await expect(page.getByRole("button", { name: "Save First Name" })).toBeVisible();
  });

  test("pressing Escape cancels editing", async ({ page }) => {
    await page.goto("/profile");

    await page.getByRole("button", { name: "Edit First Name" }).click();
    await page.getByRole("textbox", { name: "First Name" }).press("Escape");

    await expect(page.getByRole("textbox", { name: "First Name" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Edit First Name" })).toBeVisible();
  });

  test("successful update shows success toast", async ({ page }) => {
    // Override /user PATCH to succeed
    await page.route(`${API_URL}/user`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...mockUserProfile, first_name: "Janet" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockUserProfile),
        });
      }
    });

    await page.goto("/profile");

    await page.getByRole("button", { name: "Edit First Name" }).click();
    const input = page.getByRole("textbox", { name: "First Name" });
    await input.clear();
    await input.fill("Janet");
    await page.getByRole("button", { name: "Save First Name" }).click();

    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByText("Profile updated successfully")).toBeVisible();
  });

  test("validation error stays in editing mode and shows field error", async ({ page }) => {
    // Override /user PATCH to return validation error
    await page.route(`${API_URL}/user`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 400,
            error: "Bad Request",
            message: "Validation failed",
            errors: { email: "Must be a valid email address" },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockUserProfile),
        });
      }
    });

    await page.goto("/profile");

    await page.getByRole("button", { name: "Edit Email" }).click();
    const input = page.getByRole("textbox", { name: "Email" });
    await input.clear();
    await input.fill("not-an-email");
    await page.getByRole("button", { name: "Save Email" }).click();

    // Field error should appear and editor stays open
    await expect(page.getByText("Must be a valid email address")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  });

  test("pressing Enter submits the edit", async ({ page }) => {
    await page.route(`${API_URL}/user`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...mockUserProfile, first_name: "Janet" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockUserProfile),
        });
      }
    });

    await page.goto("/profile");

    await page.getByRole("button", { name: "Edit First Name" }).click();
    const input = page.getByRole("textbox", { name: "First Name" });
    await input.clear();
    await input.fill("Janet");
    await input.press("Enter");

    await expect(page.getByText("Profile updated successfully")).toBeVisible();
  });

  test("clicking toast dismisses it", async ({ page }) => {
    await page.route(`${API_URL}/user`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...mockUserProfile, first_name: "Janet" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockUserProfile),
        });
      }
    });

    await page.goto("/profile");

    await page.getByRole("button", { name: "Edit First Name" }).click();
    const input = page.getByRole("textbox", { name: "First Name" });
    await input.fill("Janet");
    await page.getByRole("button", { name: "Save First Name" }).click();

    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();
    await toast.click();
    await expect(toast).not.toBeVisible();
  });
});

test.describe("Profile page — API error handling", () => {
  test("shows error toast when GET /user fails", async ({ page }) => {
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

    await page.route(`${API_URL}/user`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 500,
          message: "Internal server error",
          error: "Internal Server Error",
        }),
      });
    });

    await page.goto("/profile");

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Internal server error")).toBeVisible();
  });
});

test.describe("Profile page — responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test("renders correctly at desktop width (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: "Manage Your Profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Addresses" })).toBeVisible();
  });

  test("renders correctly at tablet width (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: "Manage Your Profile" })).toBeVisible();
  });

  test("renders correctly at mobile width (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: "Manage Your Profile" })).toBeVisible();
  });
});

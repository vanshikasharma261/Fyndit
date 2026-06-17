import { test, expect } from "@playwright/test";

const API_URL = "http://localhost:3000";

// ---- Authentication: Login page ----

test.describe("Login page", () => {
  test("renders the login form with correct fields", async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized", error: "Unauthorized" }),
      });
    });

    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("shows Fyndit branding", async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized", error: "Unauthorized" }),
      });
    });

    await page.goto("/login");
    await expect(page.getByText(/Fynd/)).toBeVisible();
  });

  test("has a link to the signup page", async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized", error: "Unauthorized" }),
      });
    });

    await page.goto("/login");
    const link = page.getByRole("link", { name: "Sign up" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/signup");
  });

  test("shows invalid credentials error message", async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized", error: "Unauthorized" }),
      });
    });

    await page.route(`${API_URL}/auth/login`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Invalid email or password.", error: "Unauthorized" }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("wrong@example.com");
    await page.getByLabel("Password").fill("wrongpass");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("disables Sign In button while loading", async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized", error: "Unauthorized" }),
      });
    });

    let resolveLogin!: (value: unknown) => void;
    const loginPending = new Promise((r) => { resolveLogin = r; });

    await page.route(`${API_URL}/auth/login`, async (route) => {
      await loginPending;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "u1", email: "jane@example.com" }, message: "Logged in" }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("jane@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByRole("button", { name: "Signing in..." })).toBeDisabled();
    resolveLogin(undefined);
  });

  test("redirects to home on successful login", async ({ page }) => {
    /**
     * The app runs in React StrictMode, so useEffect fires twice during
     * development. App.tsx calls fetchCurrentUser() on mount (potentially twice
     * with StrictMode). We need ALL initial /auth/me calls to return 401 (so the
     * login page stays open), then once the user submits the login form,
     * /auth/login returns 200 and the subsequent /auth/me call (from
     * loginUser.fulfilled) should return 200.
     *
     * Strategy: track whether /auth/login has been called. Before login, /auth/me
     * returns 401. After login, /auth/me returns 200.
     */
    let loginCompleted = false;

    await page.route(`${API_URL}/auth/me`, async (route) => {
      if (loginCompleted) {
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
      } else {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ statusCode: 401, message: "Unauthorized", error: "Unauthorized" }),
        });
      }
    });

    await page.route(`${API_URL}/auth/login`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "user-1", email: "jane@example.com" }, message: "Logged in" }),
      });
      // Set flag AFTER fulfilling so the redirect to / triggers on subsequent /auth/me
      loginCompleted = true;
    });

    await page.goto("/login");

    // Wait for the form to be ready (authChecked=true means the initial /auth/me resolved)
    await expect(page.getByRole("button", { name: "Sign In" })).toBeEnabled();

    await page.getByLabel("Email").fill("jane@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL("/", { timeout: 10000 });
  });
});

// ---- Authentication: Redirect behavior ----

test.describe("Auth-protected routes", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized", error: "Unauthorized" }),
      });
    });
  });

  test("unauthenticated user is redirected to /login when accessing /", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("unauthenticated user is redirected to /login when accessing /profile", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL("/login");
  });

  test("unauthenticated user is redirected to /login when accessing /cart", async ({ page }) => {
    await page.goto("/cart");
    await expect(page).toHaveURL("/login");
  });
});

// ---- Signup page ----

test.describe("Signup page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_URL}/auth/me`, async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 401, message: "Unauthorized", error: "Unauthorized" }),
      });
    });
  });

  test("renders the signup form with Account and Address fieldsets", async ({ page }) => {
    await page.goto("/signup");

    await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Default Address" })).toBeVisible();
  });

  test("has a link back to the login page", async ({ page }) => {
    await page.goto("/signup");
    const link = page.getByRole("link", { name: "Sign in" });
    await expect(link).toBeVisible();
  });

  test("shows server-side error message on failed signup", async ({ page }) => {
    await page.route(`${API_URL}/auth/signup`, async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 409, message: "Email is already in use.", error: "Conflict" }),
      });
    });

    await page.goto("/signup");

    await page.getByLabel("Email").fill("existing@example.com");
    await page.getByLabel("Password").fill("Password123!");
    await page.getByLabel("First Name").fill("Jane");
    await page.getByLabel("Last Name").fill("Doe");
    await page.getByLabel("Username").fill("janedoe");
    await page.getByLabel("Phone").fill("9876543210");
    await page.getByLabel("Address Line 1").fill("123 Main St");
    await page.getByLabel("City").fill("Mumbai");
    await page.getByLabel("State").selectOption("Maharashtra");
    await page.getByLabel("Zip Code").fill("400001");

    await page.getByRole("button", { name: "Sign Up" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Email is already in use.")).toBeVisible();
  });

  test("redirects to login with registered banner after successful signup", async ({ page }) => {
    await page.route(`${API_URL}/auth/signup`, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ message: "Account created successfully" }),
      });
    });

    await page.goto("/signup");

    await page.getByLabel("Email").fill("newuser@example.com");
    await page.getByLabel("Password").fill("Password123!");
    await page.getByLabel("First Name").fill("New");
    await page.getByLabel("Last Name").fill("User");
    await page.getByLabel("Username").fill("newuser");
    await page.getByLabel("Phone").fill("9876543211");
    await page.getByLabel("Address Line 1").fill("456 Park Avenue");
    await page.getByLabel("City").fill("Delhi");
    await page.getByLabel("State").selectOption("Delhi");
    await page.getByLabel("Zip Code").fill("110001");

    await page.getByRole("button", { name: "Sign Up" }).click();

    await expect(page).toHaveURL("/login");
    await expect(page.getByText("Account created successfully. Please sign in.")).toBeVisible();
  });
});

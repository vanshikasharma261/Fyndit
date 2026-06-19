import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/renderWithProviders";
import ProfilePage from "./ProfilePage";
import type { UserProfile } from "../../types/user.types";

// ---- Mock service layer so no real fetches happen ----
vi.mock("../../features/user/userService", () => ({
  userService: {
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

import { userService } from "../../features/user/userService";

const mockUserService = userService as {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const mockProfile: UserProfile = {
  id: "user-1",
  email: "jane@example.com",
  first_name: "Jane",
  last_name: "Doe",
  user_name: "janedoe",
  phone: "9876543210",
};

describe("ProfilePage — rendering", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUserService.get.mockResolvedValue({ ok: true, data: mockProfile });
  });

  it("renders the Manage Your Profile heading", async () => {
    renderWithProviders(<ProfilePage />);
    expect(
      await screen.findByRole("heading", { name: "Manage Your Profile" }),
    ).toBeInTheDocument();
  });

  it("renders the Addresses heading", async () => {
    renderWithProviders(<ProfilePage />);
    expect(
      await screen.findByRole("heading", { name: "Addresses" }),
    ).toBeInTheDocument();
  });

  it("shows loading text before profile data arrives", () => {
    // Delay resolution so loading state is visible
    mockUserService.get.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ProfilePage />);
    // Scope to the profile section — the Addresses panel also renders a
    // "Loading…" while its own fetch is in flight, so an unscoped query is
    // ambiguous under RTL strict mode.
    const profileSection = screen
      .getByRole("heading", { name: "Manage Your Profile" })
      .closest("section")!;
    expect(within(profileSection).getByText("Loading…")).toBeInTheDocument();
  });

  it("displays profile field labels after data loads", async () => {
    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("First Name:")).toBeInTheDocument();
      expect(screen.getByText("Last Name:")).toBeInTheDocument();
      expect(screen.getByText("User Name:")).toBeInTheDocument();
      expect(screen.getByText("Email:")).toBeInTheDocument();
      expect(screen.getByText("Phone:")).toBeInTheDocument();
    });
  });

  it("displays profile field values after data loads", async () => {
    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Jane")).toBeInTheDocument();
      expect(screen.getByText("Doe")).toBeInTheDocument();
      expect(screen.getByText("janedoe")).toBeInTheDocument();
      expect(screen.getByText("jane@example.com")).toBeInTheDocument();
      expect(screen.getByText("9876543210")).toBeInTheDocument();
    });
  });

  it("shows a dash placeholder for null phone", async () => {
    mockUserService.get.mockResolvedValue({
      ok: true,
      data: { ...mockProfile, phone: null },
    });
    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      // The phone row's value span should show "—"
      const rows = screen.getAllByText("—");
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("renders edit buttons for each profile field", async () => {
    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit First Name" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit Email" })).toBeInTheDocument();
    });
  });
});

describe("ProfilePage — inline editing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUserService.get.mockResolvedValue({ ok: true, data: mockProfile });
  });

  it("opens inline input when edit button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const editBtn = await screen.findByRole("button", { name: "Edit First Name" });
    await user.click(editBtn);

    expect(screen.getByRole("textbox", { name: "First Name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save First Name" })).toBeInTheDocument();
  });

  it("input is pre-populated with current value", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const editBtn = await screen.findByRole("button", { name: "Edit First Name" });
    await user.click(editBtn);

    const input = screen.getByRole("textbox", { name: "First Name" });
    expect(input).toHaveValue("Jane");
  });

  it("calls updateUser and closes editor on Save click (success)", async () => {
    const user = userEvent.setup();
    const updatedProfile = { ...mockProfile, first_name: "Janet" };
    mockUserService.update.mockResolvedValue({ ok: true, data: updatedProfile });

    renderWithProviders(<ProfilePage />);

    const editBtn = await screen.findByRole("button", { name: "Edit First Name" });
    await user.click(editBtn);

    const input = screen.getByRole("textbox", { name: "First Name" });
    await user.clear(input);
    await user.type(input, "Janet");

    const saveBtn = screen.getByRole("button", { name: "Save First Name" });
    await user.click(saveBtn);

    // Should show success toast and close the editor
    await waitFor(() => {
      expect(screen.getByText("Profile updated successfully")).toBeInTheDocument();
    });
    // Edit button should be back (editor closed)
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "First Name" })).not.toBeInTheDocument();
    });
  });

  it("submits on Enter key press", async () => {
    const user = userEvent.setup();
    const updatedProfile = { ...mockProfile, first_name: "Janet" };
    mockUserService.update.mockResolvedValue({ ok: true, data: updatedProfile });

    renderWithProviders(<ProfilePage />);

    const editBtn = await screen.findByRole("button", { name: "Edit First Name" });
    await user.click(editBtn);

    const input = screen.getByRole("textbox", { name: "First Name" });
    await user.clear(input);
    await user.type(input, "Janet{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Profile updated successfully")).toBeInTheDocument();
    });
  });

  it("closes editor on Escape key press without saving", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    const editBtn = await screen.findByRole("button", { name: "Edit First Name" });
    await user.click(editBtn);

    const input = screen.getByRole("textbox", { name: "First Name" });
    await user.type(input, "{Escape}");

    // Editor should be closed, update should not have been called
    expect(screen.queryByRole("textbox", { name: "First Name" })).not.toBeInTheDocument();
    expect(mockUserService.update).not.toHaveBeenCalled();
  });

  it("shows inline field error and keeps editor open on validation failure", async () => {
    const user = userEvent.setup();
    mockUserService.update.mockResolvedValue({
      ok: false,
      data: {
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: { email: "Must be a valid email" },
      },
    });

    renderWithProviders(<ProfilePage />);

    const editBtn = await screen.findByRole("button", { name: "Edit Email" });
    await user.click(editBtn);

    const saveBtn = screen.getByRole("button", { name: "Save Email" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Must be a valid email")).toBeInTheDocument();
    });
    // Editor should remain open
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
  });
});

describe("ProfilePage — toast notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUserService.get.mockResolvedValue({ ok: true, data: mockProfile });
  });

  it("shows error toast when profile fetch fails", async () => {
    mockUserService.get.mockResolvedValue({
      ok: false,
      data: { statusCode: 401, message: "Session expired", error: "Unauthorized" },
    });

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Session expired")).toBeInTheDocument();
    });
  });

  it("shows success toast with ✓ icon on successful update", async () => {
    const user = userEvent.setup();
    mockUserService.update.mockResolvedValue({
      ok: true,
      data: { ...mockProfile, first_name: "Janet" },
    });

    renderWithProviders(<ProfilePage />);

    const editBtn = await screen.findByRole("button", { name: "Edit First Name" });
    await user.click(editBtn);
    await user.click(screen.getByRole("button", { name: "Save First Name" }));

    await waitFor(() => {
      const toast = screen.getByRole("status");
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveTextContent("✓");
      expect(toast).toHaveTextContent("Profile updated successfully");
    });
  });

  it("dismisses toast when clicked", async () => {
    const user = userEvent.setup();
    mockUserService.update.mockResolvedValue({
      ok: true,
      data: { ...mockProfile, first_name: "Janet" },
    });

    renderWithProviders(<ProfilePage />);

    const editBtn = await screen.findByRole("button", { name: "Edit First Name" });
    await user.click(editBtn);
    await user.click(screen.getByRole("button", { name: "Save First Name" }));

    const toast = await screen.findByRole("status");
    await user.click(toast);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});

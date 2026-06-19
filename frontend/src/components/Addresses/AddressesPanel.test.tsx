import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/renderWithProviders";
import AddressesPanel from "./AddressesPanel";
import type { AddressResponse } from "../../types/address.types";

// ---- Mock the address service ----
vi.mock("../../features/address/addressService", () => ({
  addressService: {
    list: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setDefault: vi.fn(),
  },
}));

// ---- Stub react-toastify ----
vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { addressService } from "../../features/address/addressService";
import { toast } from "react-toastify";

const mockAddressService = addressService as {
  list: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setDefault: ReturnType<typeof vi.fn>;
};

const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

// ---- Fixtures ----

const mockDefaultAddress: AddressResponse = {
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

const mockNonDefaultAddress: AddressResponse = {
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

function makeFiveAddresses(): AddressResponse[] {
  return Array.from({ length: 5 }, (_, i) => ({
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
}

// ---- Helpers ----

function renderEmptyPanel() {
  mockAddressService.list.mockResolvedValue({ ok: true, data: [] });
  return renderWithProviders(<AddressesPanel />);
}

function renderPopulatedPanel(addresses: AddressResponse[] = [mockDefaultAddress]) {
  mockAddressService.list.mockResolvedValue({ ok: true, data: addresses });
  return renderWithProviders(<AddressesPanel />);
}

function renderLoadingPanel() {
  mockAddressService.list.mockReturnValue(new Promise(() => {})); // never-resolving
  return renderWithProviders(<AddressesPanel />);
}

// ---- Tests ----

describe("AddressesPanel — loading state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows loading text while addresses are being fetched", () => {
    renderLoadingPanel();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});

describe("AddressesPanel — empty state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows empty message when no addresses are saved", async () => {
    renderEmptyPanel();
    await waitFor(() => {
      expect(screen.getByText("No addresses saved yet.")).toBeInTheDocument();
    });
  });

  it("shows the 'Add Address' button when no addresses exist", async () => {
    renderEmptyPanel();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Add Address/i }),
      ).toBeInTheDocument();
    });
  });
});

describe("AddressesPanel — list mode with addresses", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders an address card for each address", async () => {
    renderPopulatedPanel([mockDefaultAddress, mockNonDefaultAddress]);
    await waitFor(() => {
      expect(screen.getByText("123 Main St")).toBeInTheDocument();
      expect(screen.getByText("456 Office Rd")).toBeInTheDocument();
    });
  });

  it("shows 'Add Address' button when fewer than 5 addresses exist", async () => {
    renderPopulatedPanel([mockDefaultAddress]);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Add Address/i }),
      ).toBeInTheDocument();
    });
  });

  it("hides 'Add Address' button and shows limit note at 5 addresses", async () => {
    renderPopulatedPanel(makeFiveAddresses());
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Add Address/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText("You can save up to 5 addresses."),
      ).toBeInTheDocument();
    });
  });
});

describe("AddressesPanel — Default badge and Set as default action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows 'Default' badge on the default address card", async () => {
    renderPopulatedPanel([mockDefaultAddress, mockNonDefaultAddress]);
    await waitFor(() => {
      expect(screen.getByText("Default")).toBeInTheDocument();
    });
  });

  it("does NOT show 'Default' badge on a non-default card", async () => {
    // Only one non-default address in the list
    const nonDefault = { ...mockNonDefaultAddress, is_default: false };
    renderPopulatedPanel([nonDefault]);
    await waitFor(() => {
      expect(screen.queryByText("Default")).not.toBeInTheDocument();
    });
  });

  it("shows 'Set as default' button on non-default cards", async () => {
    renderPopulatedPanel([mockDefaultAddress, mockNonDefaultAddress]);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Set as default/i }),
      ).toBeInTheDocument();
    });
  });

  it("does NOT show 'Set as default' on the default card", async () => {
    // Only the default address in the list
    renderPopulatedPanel([mockDefaultAddress]);
    await waitFor(() => {
      // No "Set as default" because the only card is the default
      expect(
        screen.queryByRole("button", { name: /Set as default/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("exactly one 'Set as default' button when two addresses, one default", async () => {
    renderPopulatedPanel([mockDefaultAddress, mockNonDefaultAddress]);
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /Set as default/i });
      expect(buttons).toHaveLength(1);
    });
  });
});

describe("AddressesPanel — list ↔ form toggle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("opens the add form when 'Add Address' is clicked", async () => {
    const user = userEvent.setup();
    renderEmptyPanel();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Add Address/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Add Address/i }));

    // The form is now visible (Add button inside form)
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("returns to list mode when Cancel is clicked in add form", async () => {
    const user = userEvent.setup();
    renderEmptyPanel();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Add Address/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Add Address/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Back to list mode — "Add Address" button should reappear
    expect(
      screen.getByRole("button", { name: /Add Address/i }),
    ).toBeInTheDocument();
  });

  it("opens the edit form when the edit (pencil) button is clicked on a card", async () => {
    const user = userEvent.setup();
    renderPopulatedPanel([mockDefaultAddress]);

    await waitFor(() => {
      expect(screen.getByText("123 Main St")).toBeInTheDocument();
    });

    // The edit button has aria-label "Edit home address"
    await user.click(
      screen.getByRole("button", { name: /Edit home address/i }),
    );

    // The form should now be visible in edit mode
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("pre-fills the edit form with the card's address data", async () => {
    const user = userEvent.setup();
    renderPopulatedPanel([mockDefaultAddress]);

    await waitFor(() => {
      expect(screen.getByText("123 Main St")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /Edit home address/i }),
    );

    // Line 1 is pre-filled
    expect(screen.getByPlaceholderText("House No.")).toHaveValue("123 Main St");
    expect(screen.getByPlaceholderText("City")).toHaveValue("Mumbai");
    expect(screen.getByPlaceholderText("Zip Code")).toHaveValue("400001");
  });

  it("returns to list mode when Cancel is clicked in edit form", async () => {
    const user = userEvent.setup();
    renderPopulatedPanel([mockDefaultAddress]);

    await waitFor(() => {
      expect(screen.getByText("123 Main St")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /Edit home address/i }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Back to list
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
  });
});

describe("AddressesPanel — add address flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows success toast and returns to list on successful add", async () => {
    const user = userEvent.setup();
    const newAddress: AddressResponse = {
      ...mockDefaultAddress,
      address_id: "addr-new",
    };
    mockAddressService.list.mockResolvedValue({ ok: true, data: [] });
    mockAddressService.add.mockResolvedValue({ ok: true, data: newAddress });
    // After add, list is re-fetched
    mockAddressService.list
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValue({ ok: true, data: [newAddress] });

    renderWithProviders(<AddressesPanel />);

    // Wait for empty state, then open add form
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Add Address/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Add Address/i }));

    // Fill in required fields
    await user.type(screen.getByPlaceholderText("House No."), "123 Main St");
    await user.type(screen.getByPlaceholderText("City"), "Mumbai");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "State" }),
      "Maharashtra",
    );
    await user.type(screen.getByPlaceholderText("Zip Code"), "400001");

    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Address added");
    });
  });

  it("shows inline errors and does not navigate away on validation failure", async () => {
    const user = userEvent.setup();
    mockAddressService.list.mockResolvedValue({ ok: true, data: [] });
    mockAddressService.add.mockResolvedValue({
      ok: false,
      data: {
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: { zip: "Invalid Zip Code" },
      },
    });

    renderWithProviders(<AddressesPanel />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Add Address/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Add Address/i }));

    await user.type(screen.getByPlaceholderText("House No."), "123 Main St");
    await user.type(screen.getByPlaceholderText("City"), "Mumbai");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "State" }),
      "Maharashtra",
    );
    await user.type(screen.getByPlaceholderText("Zip Code"), "BAD");

    await user.click(screen.getByRole("button", { name: "Add" }));

    // Inline error appears; form stays open (Update/Add button is visible)
    await waitFor(() => {
      expect(screen.getByText(/Invalid Zip Code/)).toBeInTheDocument();
    });

    // The form is still open (not navigated away)
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();

    // No error toast for a validation error
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("shows error toast (not inline) on non-validation failure", async () => {
    const user = userEvent.setup();
    mockAddressService.list.mockResolvedValue({ ok: true, data: [] });
    mockAddressService.add.mockResolvedValue({
      ok: false,
      data: {
        statusCode: 500,
        error: "Internal Server Error",
        message: "Something went wrong",
      },
    });

    renderWithProviders(<AddressesPanel />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Add Address/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Add Address/i }));

    await user.type(screen.getByPlaceholderText("House No."), "123 Main St");
    await user.type(screen.getByPlaceholderText("City"), "Mumbai");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "State" }),
      "Maharashtra",
    );
    await user.type(screen.getByPlaceholderText("Zip Code"), "400001");

    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Something went wrong");
    });
  });
});

describe("AddressesPanel — remove address flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows success toast after successful remove", async () => {
    const user = userEvent.setup();
    mockAddressService.list.mockResolvedValue({
      ok: true,
      data: [mockDefaultAddress],
    });
    mockAddressService.remove.mockResolvedValue({
      ok: true,
      data: { message: "Address removed" },
    });
    // After remove, list is re-fetched to empty
    mockAddressService.list
      .mockResolvedValueOnce({ ok: true, data: [mockDefaultAddress] })
      .mockResolvedValue({ ok: true, data: [] });

    renderWithProviders(<AddressesPanel />);

    await waitFor(() => {
      expect(screen.getByText("123 Main St")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /Remove home address/i }),
    );

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Address removed");
    });
  });
});

describe("AddressesPanel — set default flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows success toast after setting a new default", async () => {
    const user = userEvent.setup();
    mockAddressService.list.mockResolvedValue({
      ok: true,
      data: [mockDefaultAddress, mockNonDefaultAddress],
    });
    const refreshedList: AddressResponse[] = [
      { ...mockNonDefaultAddress, is_default: true },
      { ...mockDefaultAddress, is_default: false },
    ];
    mockAddressService.setDefault.mockResolvedValue({
      ok: true,
      data: refreshedList,
    });

    renderWithProviders(<AddressesPanel />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Set as default/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Set as default/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Default address updated");
    });
  });
});

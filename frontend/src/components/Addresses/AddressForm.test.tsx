import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import AddressForm from "./AddressForm";
import { INDIAN_STATES, SUPPORTED_COUNTRY } from "../../constants/location";
import type { AddressResponse, FieldValidationErrors } from "../../types/address.types";

// ---- Fixtures ----

const mockInitialAddress: AddressResponse = {
  address_id: "addr-1",
  address_type: "WORK",
  line1: "456 Office Rd",
  line2: "Suite 200",
  city: "Pune",
  state: "Maharashtra",
  country: "India",
  zip: "411001",
  is_default: false,
};

function renderForm({
  mode = "add" as "add" | "edit",
  initial = undefined as AddressResponse | undefined,
  saving = false,
  errors = null as FieldValidationErrors | null,
  onSubmit = vi.fn(),
  onCancel = vi.fn(),
} = {}) {
  return render(
    <AddressForm
      mode={mode}
      initial={initial}
      saving={saving}
      errors={errors}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
}

// ---- Address type pills ----

describe("AddressForm — address type pills", () => {
  it("renders HOME, WORK, and OTHER type pills", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "HOME" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WORK" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OTHER" })).toBeInTheDocument();
  });

  it("HOME pill is selected by default in add mode (aria-pressed=true)", () => {
    renderForm({ mode: "add" });
    expect(screen.getByRole("button", { name: "HOME" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "WORK" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "OTHER" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("pre-selects the initial address_type in edit mode", () => {
    renderForm({ mode: "edit", initial: mockInitialAddress });
    expect(screen.getByRole("button", { name: "WORK" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "HOME" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("clicking a pill changes the selection", async () => {
    const user = userEvent.setup();
    renderForm({ mode: "add" });

    await user.click(screen.getByRole("button", { name: "OTHER" }));

    expect(screen.getByRole("button", { name: "OTHER" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "HOME" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("pill group has accessible label 'Address Type'", () => {
    renderForm();
    expect(
      screen.getByRole("group", { name: "Address Type" }),
    ).toBeInTheDocument();
  });
});

// ---- State dropdown ----

describe("AddressForm — State dropdown", () => {
  it("renders a State select with INDIAN_STATES options", () => {
    renderForm();
    const select = screen.getByRole("combobox", { name: "State" });
    expect(select).toBeInTheDocument();

    // Check a sample of states are present as options
    INDIAN_STATES.forEach((state) => {
      expect(screen.getByRole("option", { name: state })).toBeInTheDocument();
    });
  });

  it("has a disabled 'Select State' placeholder option", () => {
    renderForm();
    const placeholder = screen.getByRole("option", { name: "Select State" });
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toBeDisabled();
  });

  it("pre-fills State in edit mode", () => {
    renderForm({ mode: "edit", initial: mockInitialAddress });
    const select = screen.getByRole("combobox", { name: "State" });
    expect(select).toHaveValue("Maharashtra");
  });
});

// ---- Country field (disabled India) ----

describe("AddressForm — Country field", () => {
  it("renders Country input with value India", () => {
    renderForm();
    const countryInput = screen.getByLabelText("Country");
    expect(countryInput).toHaveValue(SUPPORTED_COUNTRY);
  });

  it("Country input is disabled", () => {
    renderForm();
    const countryInput = screen.getByLabelText("Country");
    expect(countryInput).toBeDisabled();
  });
});

// ---- Pre-fill in edit mode ----

describe("AddressForm — edit mode pre-fill", () => {
  it("pre-fills Line 1 in edit mode", () => {
    renderForm({ mode: "edit", initial: mockInitialAddress });
    expect(screen.getByPlaceholderText("House No.")).toHaveValue("456 Office Rd");
  });

  it("pre-fills Line 2 in edit mode", () => {
    renderForm({ mode: "edit", initial: mockInitialAddress });
    expect(screen.getByPlaceholderText("Street Line")).toHaveValue("Suite 200");
  });

  it("pre-fills City in edit mode", () => {
    renderForm({ mode: "edit", initial: mockInitialAddress });
    expect(screen.getByPlaceholderText("City")).toHaveValue("Pune");
  });

  it("pre-fills Zip in edit mode", () => {
    renderForm({ mode: "edit", initial: mockInitialAddress });
    expect(screen.getByPlaceholderText("Zip Code")).toHaveValue("411001");
  });
});

// ---- Submit button labels ----

describe("AddressForm — submit button labels", () => {
  it("shows 'Add' submit button in add mode", () => {
    renderForm({ mode: "add" });
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("shows 'Update' submit button in edit mode", () => {
    renderForm({ mode: "edit", initial: mockInitialAddress });
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("renders the Cancel button", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});

// ---- saving state ----

describe("AddressForm — saving/disabled state", () => {
  it("disables Cancel and Submit buttons when saving=true", () => {
    renderForm({ saving: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("enables buttons when saving=false", () => {
    renderForm({ saving: false });
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).not.toBeDisabled();
  });
});

// ---- Cancel callback ----

describe("AddressForm — Cancel button", () => {
  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderForm({ onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});

// ---- Inline field errors ----

describe("AddressForm — inline field errors", () => {
  it("renders error text for zip when errors.zip is set", () => {
    renderForm({ errors: { zip: "Invalid Zip Code" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Invalid Zip Code/)).toBeInTheDocument();
  });

  it("adds error class (aria-invalid) to zip input when errors.zip is set", () => {
    renderForm({ errors: { zip: "Invalid Zip Code" } });
    const zipInput = screen.getByPlaceholderText("Zip Code");
    expect(zipInput).toHaveAttribute("aria-invalid", "true");
  });

  it("does not render error text when errors is null", () => {
    renderForm({ errors: null });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders error for line1 when errors.line1 is set", () => {
    renderForm({ errors: { line1: "Line 1 is required" } });
    expect(screen.getByText(/Line 1 is required/)).toBeInTheDocument();
    expect(screen.getByLabelText("Line 1")).toHaveAttribute("aria-invalid", "true");
  });

  it("renders error for city when errors.city is set", () => {
    renderForm({ errors: { city: "City is required" } });
    expect(screen.getByText(/City is required/)).toBeInTheDocument();
  });

  it("renders error for state when errors.state is set", () => {
    renderForm({ errors: { state: "Invalid state" } });
    expect(screen.getByText(/Invalid state/)).toBeInTheDocument();
    const select = screen.getByRole("combobox", { name: "State" });
    expect(select).toHaveAttribute("aria-invalid", "true");
  });

  it("links zip input to error message via aria-describedby", () => {
    renderForm({ errors: { zip: "Invalid Zip Code" } });
    const zipInput = screen.getByPlaceholderText("Zip Code");
    expect(zipInput).toHaveAttribute("aria-describedby", "address-zip-error");
    expect(screen.getByText(/Invalid Zip Code/)).toHaveAttribute(
      "id",
      "address-zip-error",
    );
  });
});

// ---- Form submission ----

describe("AddressForm — form submission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls onSubmit with the correct trimmed payload on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ mode: "add", onSubmit });

    await user.type(screen.getByPlaceholderText("House No."), "  123 Main St  ");
    await user.type(screen.getByPlaceholderText("City"), "  Mumbai  ");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "State" }),
      "Maharashtra",
    );
    await user.type(screen.getByPlaceholderText("Zip Code"), "400001");

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onSubmit).toHaveBeenCalledOnce();
    const [payload] = onSubmit.mock.calls[0] as [ReturnType<typeof onSubmit>];
    expect(payload).toMatchObject({
      address_type: "HOME",
      line1: "123 Main St",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      zip: "400001",
    });
  });

  it("omits line2 from payload when line2 is empty (trimmed)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ mode: "add", onSubmit });

    await user.type(screen.getByPlaceholderText("House No."), "123 Main St");
    await user.type(screen.getByPlaceholderText("City"), "Mumbai");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "State" }),
      "Maharashtra",
    );
    await user.type(screen.getByPlaceholderText("Zip Code"), "400001");
    // Leave line2 blank

    await user.click(screen.getByRole("button", { name: "Add" }));

    const [payload] = onSubmit.mock.calls[0] as [ReturnType<typeof onSubmit>];
    expect(payload).not.toHaveProperty("line2");
  });

  it("includes line2 in the payload when provided", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ mode: "add", onSubmit });

    await user.type(screen.getByPlaceholderText("House No."), "123 Main St");
    await user.type(screen.getByPlaceholderText("Street Line"), "Apt 4B");
    await user.type(screen.getByPlaceholderText("City"), "Mumbai");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "State" }),
      "Maharashtra",
    );
    await user.type(screen.getByPlaceholderText("Zip Code"), "400001");

    await user.click(screen.getByRole("button", { name: "Add" }));

    const [payload] = onSubmit.mock.calls[0] as [ReturnType<typeof onSubmit>];
    expect(payload).toHaveProperty("line2", "Apt 4B");
  });

  it("sends the selected address_type in the payload", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ mode: "add", onSubmit });

    await user.click(screen.getByRole("button", { name: "WORK" }));
    await user.type(screen.getByPlaceholderText("House No."), "456 Office Rd");
    await user.type(screen.getByPlaceholderText("City"), "Pune");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "State" }),
      "Maharashtra",
    );
    await user.type(screen.getByPlaceholderText("Zip Code"), "411001");

    await user.click(screen.getByRole("button", { name: "Add" }));

    const [payload] = onSubmit.mock.calls[0] as [ReturnType<typeof onSubmit>];
    expect(payload.address_type).toBe("WORK");
  });

  it("always sends 'India' as country in the payload", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ mode: "add", onSubmit });

    await user.type(screen.getByPlaceholderText("House No."), "123 Main St");
    await user.type(screen.getByPlaceholderText("City"), "Mumbai");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "State" }),
      "Maharashtra",
    );
    await user.type(screen.getByPlaceholderText("Zip Code"), "400001");

    await user.click(screen.getByRole("button", { name: "Add" }));

    const [payload] = onSubmit.mock.calls[0] as [ReturnType<typeof onSubmit>];
    expect(payload.country).toBe("India");
  });
});

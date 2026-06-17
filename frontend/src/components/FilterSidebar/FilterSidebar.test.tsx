import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterSidebar from "./FilterSidebar";
import type { ProductFiltersResponse } from "../../types/product.types";

const mockFilters: ProductFiltersResponse = {
  price: { min: "500.00", max: "5000.00" },
  attributes: [
    { name: "color", label: "Color", values: ["Blue", "Black", "Red"] },
    { name: "size", label: "Size", values: ["S", "M", "L"] },
  ],
};

const defaultProps = {
  filters: mockFilters,
  loading: false,
  selectedAttributes: {},
  selectedMaxPrice: undefined,
  onMaxPriceChange: vi.fn(),
  onToggleAttribute: vi.fn(),
  onClear: vi.fn(),
};

describe("FilterSidebar — rendering", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders the Filters heading", () => {
    render(<FilterSidebar {...defaultProps} />);
    expect(screen.getByRole("heading", { name: "Filters" })).toBeInTheDocument();
  });

  it("renders price range section when min and max differ", () => {
    render(<FilterSidebar {...defaultProps} />);
    expect(screen.getByRole("heading", { name: "Price Range" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Maximum price" })).toBeInTheDocument();
  });

  it("renders attribute facet headings", () => {
    render(<FilterSidebar {...defaultProps} />);
    expect(screen.getByRole("heading", { name: "Color" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Size" })).toBeInTheDocument();
  });

  it("renders attribute pill buttons", () => {
    render(<FilterSidebar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Blue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "M" })).toBeInTheDocument();
  });

  it("shows loading message when loading and no filters exist yet", () => {
    render(<FilterSidebar {...defaultProps} filters={null} loading={true} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("does not show clear button when no active filters", () => {
    render(<FilterSidebar {...defaultProps} />);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("shows clear button when attribute filters are active", () => {
    render(
      <FilterSidebar
        {...defaultProps}
        selectedAttributes={{ color: ["Blue"] }}
      />,
    );
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("shows clear button when maxPrice filter is active", () => {
    render(
      <FilterSidebar {...defaultProps} selectedMaxPrice={2000} />,
    );
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("renders nothing when filters is null and loading is false", () => {
    render(<FilterSidebar {...defaultProps} filters={null} loading={false} />);
    // Price range and attributes should not be visible
    expect(screen.queryByRole("heading", { name: "Price Range" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Blue" })).not.toBeInTheDocument();
  });
});

describe("FilterSidebar — interactions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls onToggleAttribute when a pill is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<FilterSidebar {...defaultProps} onToggleAttribute={onToggle} />);

    await user.click(screen.getByRole("button", { name: "Blue" }));
    expect(onToggle).toHaveBeenCalledWith("color", "Blue");
  });

  it("calls onClear when clear filters button is clicked", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <FilterSidebar
        {...defaultProps}
        selectedAttributes={{ color: ["Blue"] }}
        onClear={onClear}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("calls onMaxPriceChange when the slider value changes", () => {
    const onMaxPriceChange = vi.fn();
    render(<FilterSidebar {...defaultProps} onMaxPriceChange={onMaxPriceChange} />);

    const slider = screen.getByRole("slider", { name: "Maximum price" });
    fireEvent.change(slider, { target: { value: "3000" } });
    expect(onMaxPriceChange).toHaveBeenCalledWith(3000);
  });

  it("marks selected attribute pills with aria-pressed=true", () => {
    render(
      <FilterSidebar
        {...defaultProps}
        selectedAttributes={{ color: ["Blue"] }}
      />,
    );
    const blueButton = screen.getByRole("button", { name: "Blue" });
    expect(blueButton).toHaveAttribute("aria-pressed", "true");

    const blackButton = screen.getByRole("button", { name: "Black" });
    expect(blackButton).toHaveAttribute("aria-pressed", "false");
  });
});

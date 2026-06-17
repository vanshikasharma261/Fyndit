import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination from "./Pagination";

describe("Pagination — rendering", () => {
  it("renders nothing when pageCount is 1", () => {
    const { container } = render(
      <Pagination pageCount={1} currentPage={1} onPageChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when pageCount is 0", () => {
    const { container } = render(
      <Pagination pageCount={0} currentPage={1} onPageChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders pagination controls when pageCount > 1", () => {
    render(<Pagination pageCount={5} currentPage={1} onPageChange={vi.fn()} />);
    // Prev and Next labels should be visible
    expect(screen.getByText("Prev")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("renders page number links", () => {
    render(<Pagination pageCount={3} currentPage={1} onPageChange={vi.fn()} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

describe("Pagination — interactions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls onPageChange with the correct 1-based page number when a page is clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination pageCount={5} currentPage={1} onPageChange={onPageChange} />);

    // Click on page 2 (which should be visible)
    const pageTwo = screen.getByText("2");
    await user.click(pageTwo);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with next page when Next is clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination pageCount={5} currentPage={1} onPageChange={onPageChange} />);

    await user.click(screen.getByText("Next"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

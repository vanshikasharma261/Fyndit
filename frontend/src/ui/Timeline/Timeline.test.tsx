/**
 * Unit tests for the `Timeline` UI primitive (RTL).
 *
 * Covers:
 *   - Each step state renders its expected accessible affordance.
 *   - aria-current="step" is applied to the current step only.
 *   - Captions render when provided; absent when not.
 *   - Correct step count is rendered.
 *   - connectorDone class is applied to the connector leading INTO a complete step.
 *   - ariaLabel prop sets the <ol> aria-label.
 *   - Default aria-label falls back to "Progress".
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Timeline from "./Timeline";
import type { TimelineStep } from "./Timeline";

// ---- Helpers ----

/** Builds a minimal step fixture. */
function makeStep(
  label: string,
  state: TimelineStep["state"],
  caption?: string,
): TimelineStep {
  return { label, state, caption };
}

// ---- Step count ----

describe("Timeline — step count", () => {
  it("renders the correct number of <li> items", () => {
    const steps: TimelineStep[] = [
      makeStep("Placed", "complete"),
      makeStep("Confirmed", "current"),
      makeStep("Packed", "upcoming"),
    ];
    render(<Timeline steps={steps} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("renders a single-step list without error", () => {
    render(<Timeline steps={[makeStep("Placed", "complete")]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});

// ---- complete state ----

describe("Timeline — complete state", () => {
  it("renders a Check icon (lucide title or svg) for a complete step", () => {
    render(<Timeline steps={[makeStep("Placed", "complete")]} />);
    // lucide-react renders an <svg>; the component marks it aria-hidden so
    // we locate it via the container DOM query.
    const listItems = screen.getAllByRole("listitem");
    const svg = listItems[0].querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("does not set aria-current on a complete step", () => {
    render(<Timeline steps={[makeStep("Placed", "complete")]} />);
    const item = screen.getByRole("listitem");
    expect(item).not.toHaveAttribute("aria-current");
  });
});

// ---- current state ----

describe("Timeline — current state", () => {
  it("marks the current step with aria-current='step'", () => {
    const steps: TimelineStep[] = [
      makeStep("Placed", "complete"),
      makeStep("Confirmed", "current"),
      makeStep("Packed", "upcoming"),
    ];
    render(<Timeline steps={steps} />);
    const items = screen.getAllByRole("listitem");
    // Only the second item (Confirmed) should have aria-current="step"
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("no other step gets aria-current when one step is current", () => {
    const steps: TimelineStep[] = [
      makeStep("Placed", "complete"),
      makeStep("Confirmed", "current"),
      makeStep("Packed", "upcoming"),
    ];
    render(<Timeline steps={steps} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveAttribute("aria-current");
    expect(items[2]).not.toHaveAttribute("aria-current");
  });

  it("renders an inner dot span (not a Check or X svg) for the current step", () => {
    const steps: TimelineStep[] = [
      makeStep("Shipped", "current"),
    ];
    render(<Timeline steps={steps} />);
    const item = screen.getByRole("listitem");
    // No SVG icon for current state
    expect(item.querySelector("svg")).toBeNull();
  });
});

// ---- upcoming state ----

describe("Timeline — upcoming state", () => {
  it("does not set aria-current on an upcoming step", () => {
    const steps: TimelineStep[] = [
      makeStep("Delivered", "upcoming"),
    ];
    render(<Timeline steps={steps} />);
    expect(screen.getByRole("listitem")).not.toHaveAttribute("aria-current");
  });

  it("renders no icon (no svg) for upcoming steps", () => {
    const steps: TimelineStep[] = [
      makeStep("Delivered", "upcoming"),
    ];
    render(<Timeline steps={steps} />);
    const item = screen.getByRole("listitem");
    expect(item.querySelector("svg")).toBeNull();
  });
});

// ---- cancelled state ----

describe("Timeline — cancelled state", () => {
  it("renders an X icon (svg) for the cancelled step", () => {
    const steps: TimelineStep[] = [
      makeStep("Placed", "complete"),
      makeStep("Cancelled", "cancelled"),
    ];
    render(<Timeline steps={steps} />);
    const items = screen.getAllByRole("listitem");
    // The cancelled step (index 1) should have an svg (the X icon)
    const svg = items[1].querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("does not set aria-current on the cancelled step", () => {
    const steps: TimelineStep[] = [
      makeStep("Cancelled", "cancelled"),
    ];
    render(<Timeline steps={steps} />);
    expect(screen.getByRole("listitem")).not.toHaveAttribute("aria-current");
  });
});

// ---- captions ----

describe("Timeline — captions", () => {
  it("renders the caption text when caption is provided", () => {
    render(
      <Timeline
        steps={[makeStep("Placed", "complete", "01 Jun 2026")]}
      />,
    );
    expect(screen.getByText("01 Jun 2026")).toBeInTheDocument();
  });

  it("does not render a caption element when caption is undefined", () => {
    render(<Timeline steps={[makeStep("Placed", "complete")]} />);
    // Just check the label renders; no extra text node for caption
    expect(screen.queryByText(/Jun/)).not.toBeInTheDocument();
  });

  it("only the step with caption text displays it", () => {
    const steps: TimelineStep[] = [
      makeStep("Placed", "complete", "01 Jun 2026"),
      makeStep("Confirmed", "current"),
      makeStep("Packed", "upcoming"),
    ];
    render(<Timeline steps={steps} />);
    expect(screen.getByText("01 Jun 2026")).toBeInTheDocument();
    // Only one caption rendered
    expect(screen.getAllByText(/Jun/)).toHaveLength(1);
  });
});

// ---- labels ----

describe("Timeline — labels", () => {
  it("renders the label text for each step", () => {
    const steps: TimelineStep[] = [
      makeStep("Placed", "complete"),
      makeStep("Confirmed", "current"),
      makeStep("Delivered", "upcoming"),
    ];
    render(<Timeline steps={steps} />);
    expect(screen.getByText("Placed")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });
});

// ---- ariaLabel prop ----

describe("Timeline — ariaLabel prop", () => {
  it("applies the provided ariaLabel to the <ol>", () => {
    render(
      <Timeline
        steps={[makeStep("Placed", "complete")]}
        ariaLabel="Order progress"
      />,
    );
    expect(screen.getByRole("list", { name: "Order progress" })).toBeInTheDocument();
  });

  it("defaults ariaLabel to 'Progress' when not provided", () => {
    render(<Timeline steps={[makeStep("Placed", "complete")]} />);
    expect(screen.getByRole("list", { name: "Progress" })).toBeInTheDocument();
  });
});

// ---- ordered list semantics ----

describe("Timeline — ordered list semantics", () => {
  it("renders as an ordered list (<ol>)", () => {
    render(<Timeline steps={[makeStep("Placed", "complete")]} />);
    // getByRole("list") matches <ol> and <ul>; check the tagName
    const list = screen.getByRole("list");
    expect(list.tagName.toLowerCase()).toBe("ol");
  });
});

// ---- connector class for complete steps ----

describe("Timeline — connectorDone class on incoming connector", () => {
  it("applies a connectorDone class on the connector leading INTO a complete step", () => {
    const steps: TimelineStep[] = [
      makeStep("Placed", "complete"),
      makeStep("Confirmed", "complete"),
      makeStep("Packed", "current"),
    ];
    const { container } = render(<Timeline steps={steps} />);
    // The Timeline.module.css applies a CSS Module class to connectors.
    // We verify the connector element for the SECOND step (Confirmed, complete)
    // has a class containing "connectorDone" (post-module-transform it will be
    // something like "_connectorDone_xxx"). Using a substring matcher.
    const items = container.querySelectorAll("li");
    // The second <li> (Confirmed) has an incoming connector that should carry connectorDone
    const secondItem = items[1];
    const connectors = secondItem.querySelectorAll("span[aria-hidden='true']");
    // First connector span (index 0) is the incoming one
    const incomingConnector = connectors[0];
    // Check that at least one class on the incoming connector contains "connectorDone"
    const classNames = Array.from(incomingConnector.classList).join(" ");
    expect(classNames).toMatch(/connectorDone/i);
  });

  it("does not apply connectorDone on connector leading into an upcoming step", () => {
    const steps: TimelineStep[] = [
      makeStep("Placed", "current"),
      makeStep("Confirmed", "upcoming"),
    ];
    const { container } = render(<Timeline steps={steps} />);
    const items = container.querySelectorAll("li");
    const secondItem = items[1];
    const connectors = secondItem.querySelectorAll("span[aria-hidden='true']");
    const incomingConnector = connectors[0];
    const classNames = Array.from(incomingConnector.classList).join(" ");
    expect(classNames).not.toMatch(/connectorDone/i);
  });
});

// ---- full order cancelled scenario ----

describe("Timeline — full CANCELLED scenario (2 steps)", () => {
  it("renders Placed (check icon) and Cancelled (X icon)", () => {
    const steps: TimelineStep[] = [
      { id: "PENDING", label: "Placed", caption: "01 Jun 2026", state: "complete" },
      { id: "CANCELLED", label: "Cancelled", state: "cancelled" },
    ];
    render(<Timeline steps={steps} ariaLabel="Order progress" />);

    expect(screen.getByText("Placed")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("01 Jun 2026")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    // First (Placed): has svg (check), no aria-current
    expect(items[0].querySelector("svg")).not.toBeNull();
    expect(items[0]).not.toHaveAttribute("aria-current");

    // Second (Cancelled): has svg (X), no aria-current
    expect(items[1].querySelector("svg")).not.toBeNull();
    expect(items[1]).not.toHaveAttribute("aria-current");
  });
});

// ---- full DELIVERED scenario ----

describe("Timeline — full DELIVERED scenario (all 5 complete)", () => {
  it("renders 5 list items all with check icons and none with aria-current", () => {
    const steps: TimelineStep[] = [
      { id: "PENDING", label: "Placed", caption: "01 Jun 2026", state: "complete" },
      { id: "CONFIRMED", label: "Confirmed", state: "complete" },
      { id: "PACKED", label: "Packed", state: "complete" },
      { id: "SHIPPED", label: "Shipped", state: "complete" },
      { id: "DELIVERED", label: "Delivered", state: "complete" },
    ];
    render(<Timeline steps={steps} ariaLabel="Order progress" />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);

    for (const item of items) {
      expect(item.querySelector("svg")).not.toBeNull();
      expect(item).not.toHaveAttribute("aria-current");
    }
  });
});

/**
 * Unit tests for `buildOrderTimeline` — the pure derivation helper.
 *
 * These are the highest-value tests for this feature: every OrderStatus is
 * exercised, including the DELIVERED-complete and CANCELLED-terminal edge
 * cases. No rendering infrastructure required (pure function).
 */

import { describe, it, expect } from "vitest";
import { buildOrderTimeline } from "./orderTimeline";
import type { TimelineStep } from "../../ui";

// Stable ISO date used as the "created_at" fixture. Formats to "01 Jun 2026"
// via formatOrderDate (en-GB locale, "01 Jun 2026").
const CREATED_AT = "2026-06-01T10:00:00.000Z";

// ---- Helpers ----

function labels(steps: TimelineStep[]): string[] {
  return steps.map((s) => s.label);
}

function states(steps: TimelineStep[]): string[] {
  return steps.map((s) => s.state);
}

// ---- CANCELLED terminal case ----

describe("buildOrderTimeline — CANCELLED", () => {
  it("returns exactly 2 steps: Placed (complete) and Cancelled (cancelled)", () => {
    const steps = buildOrderTimeline("CANCELLED", CREATED_AT);
    expect(steps).toHaveLength(2);
  });

  it("first step is Placed with state=complete", () => {
    const steps = buildOrderTimeline("CANCELLED", CREATED_AT);
    expect(steps[0].label).toBe("Placed");
    expect(steps[0].state).toBe("complete");
  });

  it("second step is Cancelled with state=cancelled", () => {
    const steps = buildOrderTimeline("CANCELLED", CREATED_AT);
    expect(steps[1].label).toBe("Cancelled");
    expect(steps[1].state).toBe("cancelled");
  });

  it("only Placed carries the caption (the formatted date)", () => {
    const steps = buildOrderTimeline("CANCELLED", CREATED_AT);
    // Placed must have a non-empty caption
    expect(steps[0].caption).toBeTruthy();
    expect(steps[0].caption).toBe("01 Jun 2026");
    // Cancelled must have NO caption
    expect(steps[1].caption).toBeUndefined();
  });

  it("drops the middle lifecycle steps (no Confirmed/Packed/Shipped/Delivered)", () => {
    const steps = buildOrderTimeline("CANCELLED", CREATED_AT);
    const stepLabels = labels(steps);
    expect(stepLabels).not.toContain("Confirmed");
    expect(stepLabels).not.toContain("Packed");
    expect(stepLabels).not.toContain("Shipped");
    expect(stepLabels).not.toContain("Delivered");
  });

  it("Placed step carries a stable id=PENDING", () => {
    const steps = buildOrderTimeline("CANCELLED", CREATED_AT);
    expect(steps[0].id).toBe("PENDING");
  });

  it("Cancelled step carries a stable id=CANCELLED", () => {
    const steps = buildOrderTimeline("CANCELLED", CREATED_AT);
    expect(steps[1].id).toBe("CANCELLED");
  });
});

// ---- PENDING status ----

describe("buildOrderTimeline — PENDING", () => {
  it("returns exactly 5 steps (full lifecycle)", () => {
    const steps = buildOrderTimeline("PENDING", CREATED_AT);
    expect(steps).toHaveLength(5);
  });

  it("returns steps in the correct lifecycle order", () => {
    const steps = buildOrderTimeline("PENDING", CREATED_AT);
    expect(labels(steps)).toEqual([
      "Placed",
      "Confirmed",
      "Packed",
      "Shipped",
      "Delivered",
    ]);
  });

  it("Placed is current, all subsequent steps are upcoming", () => {
    const steps = buildOrderTimeline("PENDING", CREATED_AT);
    expect(states(steps)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("only Placed carries the caption", () => {
    const steps = buildOrderTimeline("PENDING", CREATED_AT);
    expect(steps[0].caption).toBe("01 Jun 2026");
    for (const step of steps.slice(1)) {
      expect(step.caption).toBeUndefined();
    }
  });

  it("each step carries the correct stable id", () => {
    const steps = buildOrderTimeline("PENDING", CREATED_AT);
    const ids = steps.map((s) => s.id);
    expect(ids).toEqual([
      "PENDING",
      "CONFIRMED",
      "PACKED",
      "SHIPPED",
      "DELIVERED",
    ]);
  });
});

// ---- CONFIRMED status ----

describe("buildOrderTimeline — CONFIRMED", () => {
  it("returns 5 steps", () => {
    expect(buildOrderTimeline("CONFIRMED", CREATED_AT)).toHaveLength(5);
  });

  it("Placed is complete, Confirmed is current, rest are upcoming", () => {
    const steps = buildOrderTimeline("CONFIRMED", CREATED_AT);
    expect(states(steps)).toEqual([
      "complete",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("only Placed carries the caption", () => {
    const steps = buildOrderTimeline("CONFIRMED", CREATED_AT);
    expect(steps[0].caption).toBe("01 Jun 2026");
    expect(steps[1].caption).toBeUndefined();
  });
});

// ---- PACKED status ----

describe("buildOrderTimeline — PACKED", () => {
  it("Placed and Confirmed are complete, Packed is current, rest are upcoming", () => {
    const steps = buildOrderTimeline("PACKED", CREATED_AT);
    expect(states(steps)).toEqual([
      "complete",
      "complete",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("only Placed carries the caption", () => {
    const steps = buildOrderTimeline("PACKED", CREATED_AT);
    expect(steps[0].caption).toBe("01 Jun 2026");
    for (const step of steps.slice(1)) {
      expect(step.caption).toBeUndefined();
    }
  });
});

// ---- SHIPPED status ----

describe("buildOrderTimeline — SHIPPED", () => {
  it("Placed, Confirmed, Packed are complete; Shipped is current; Delivered is upcoming", () => {
    const steps = buildOrderTimeline("SHIPPED", CREATED_AT);
    expect(states(steps)).toEqual([
      "complete",
      "complete",
      "complete",
      "current",
      "upcoming",
    ]);
  });

  it("only Placed carries the caption", () => {
    const steps = buildOrderTimeline("SHIPPED", CREATED_AT);
    expect(steps[0].caption).toBe("01 Jun 2026");
    for (const step of steps.slice(1)) {
      expect(step.caption).toBeUndefined();
    }
  });
});

// ---- DELIVERED status — all complete ----

describe("buildOrderTimeline — DELIVERED", () => {
  it("returns 5 steps", () => {
    expect(buildOrderTimeline("DELIVERED", CREATED_AT)).toHaveLength(5);
  });

  it("ALL steps are complete (DELIVERED is complete, not current)", () => {
    const steps = buildOrderTimeline("DELIVERED", CREATED_AT);
    expect(states(steps)).toEqual([
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
    ]);
  });

  it("no step uses state=current when status is DELIVERED", () => {
    const steps = buildOrderTimeline("DELIVERED", CREATED_AT);
    expect(steps.some((s) => s.state === "current")).toBe(false);
  });

  it("only Placed carries the caption", () => {
    const steps = buildOrderTimeline("DELIVERED", CREATED_AT);
    expect(steps[0].caption).toBe("01 Jun 2026");
    for (const step of steps.slice(1)) {
      expect(step.caption).toBeUndefined();
    }
  });
});

// ---- Caption content ----

describe("buildOrderTimeline — caption formatting", () => {
  it("caption reflects the actual createdAt date (different fixture)", () => {
    // "2026-01-15T08:30:00.000Z" → "15 Jan 2026" (en-GB)
    const steps = buildOrderTimeline("PENDING", "2026-01-15T08:30:00.000Z");
    expect(steps[0].caption).toBe("15 Jan 2026");
  });

  it("caption is an empty string (not undefined) when createdAt is invalid", () => {
    // formatOrderDate returns "" for NaN dates; the caption is set from its
    // result, so it will be a falsy string — confirm it doesn't throw.
    const steps = buildOrderTimeline("PENDING", "not-a-date");
    // Either "" or undefined is acceptable — what matters is no throw.
    expect(() => buildOrderTimeline("PENDING", "not-a-date")).not.toThrow();
    // The Placed step caption should be the empty string (formatOrderDate contract).
    expect(steps[0].caption).toBe("");
  });

  it("no non-Placed step ever gets a caption across all statuses", () => {
    const statuses = [
      "PENDING",
      "CONFIRMED",
      "PACKED",
      "SHIPPED",
      "DELIVERED",
    ] as const;

    for (const status of statuses) {
      const steps = buildOrderTimeline(status, CREATED_AT);
      const nonPlaced = steps.filter((s) => s.label !== "Placed");
      for (const step of nonPlaced) {
        expect(step.caption).toBeUndefined();
      }
    }
  });
});

// ---- Step count invariant ----

describe("buildOrderTimeline — step count invariant", () => {
  it("returns 2 steps for CANCELLED", () => {
    expect(buildOrderTimeline("CANCELLED", CREATED_AT)).toHaveLength(2);
  });

  it("returns 5 steps for all non-cancelled statuses", () => {
    const statuses = [
      "PENDING",
      "CONFIRMED",
      "PACKED",
      "SHIPPED",
      "DELIVERED",
    ] as const;

    for (const status of statuses) {
      expect(buildOrderTimeline(status, CREATED_AT)).toHaveLength(5);
    }
  });
});

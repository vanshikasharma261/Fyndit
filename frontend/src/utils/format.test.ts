import { describe, it, expect } from "vitest";
import {
  formatPrice,
  formatDiscountBadge,
  titleCase,
  formatMoney,
  formatOrderDate,
  formatOrderNumber,
} from "./format";

describe("titleCase", () => {
  it("capitalises a single word", () => {
    expect(titleCase("color")).toBe("Color");
  });

  it("capitalises hyphen-separated words", () => {
    expect(titleCase("smart-watch")).toBe("Smart Watch");
  });

  it("capitalises underscore-separated words", () => {
    expect(titleCase("first_name")).toBe("First Name");
  });

  it("capitalises space-separated words", () => {
    expect(titleCase("blue denim jacket")).toBe("Blue Denim Jacket");
  });

  it("handles empty string", () => {
    expect(titleCase("")).toBe("");
  });

  it("handles already-capitalised words", () => {
    expect(titleCase("Nike")).toBe("Nike");
  });
});

describe("formatPrice", () => {
  it("formats a numeric string as Indian rupee without decimals", () => {
    const result = formatPrice("2999.00");
    expect(result).toContain("₹");
    expect(result).toContain("2,999");
  });

  it("rounds fractional values", () => {
    const result = formatPrice("999.99");
    expect(result).toContain("1,000");
  });

  it("formats zero as ₹0", () => {
    expect(formatPrice("0")).toBe("₹0");
  });

  it("accepts a numeric value directly", () => {
    const result = formatPrice(1500);
    expect(result).toContain("₹");
    expect(result).toContain("1,500");
  });

  it("formats an invalid string as ₹0", () => {
    expect(formatPrice("not-a-number")).toBe("₹0");
  });

  it("formats large values with correct Indian grouping", () => {
    const result = formatPrice("99999.00");
    // In Indian format: 99,999
    expect(result).toContain("99,999");
  });
});

describe("formatDiscountBadge", () => {
  it("returns correct percentage string when discount is present", () => {
    // 300 off a price of 2999 ≈ 10%
    expect(formatDiscountBadge("2999.00", "300.00")).toBe("10 % off");
  });

  it("returns null when discount is 0", () => {
    expect(formatDiscountBadge("2999.00", "0")).toBeNull();
  });

  it("returns null when price is 0 to avoid divide-by-zero", () => {
    expect(formatDiscountBadge("0", "100")).toBeNull();
  });

  it("returns null when discount is 0.00 string", () => {
    expect(formatDiscountBadge("999.00", "0.00")).toBeNull();
  });

  it("rounds percentage to nearest integer", () => {
    // 150 off 999 = 15.015...% → rounds to 15
    expect(formatDiscountBadge("999.00", "150.00")).toBe("15 % off");
  });

  it("returns null when both price and discount are 0", () => {
    expect(formatDiscountBadge("0", "0")).toBeNull();
  });

  it("handles numeric (non-string) inputs", () => {
    expect(formatDiscountBadge(1000, 200)).toBe("20 % off");
  });
});

// ---- NEW: formatMoney ----

describe("formatMoney", () => {
  it("formats a 2-decimal string with ₹ and Indian grouping", () => {
    const result = formatMoney("1178.56");
    expect(result).toContain("₹");
    expect(result).toContain("1,178.56");
  });

  it("preserves exactly 2 decimal places (does not round to 0 dp)", () => {
    const result = formatMoney("1400.00");
    expect(result).toContain("1,400.00");
  });

  it("handles zero as ₹0.00", () => {
    expect(formatMoney("0.00")).toBe("₹0.00");
  });

  it("handles integer string (adds .00)", () => {
    const result = formatMoney("500");
    expect(result).toContain("500.00");
  });

  it("accepts a numeric value directly", () => {
    const result = formatMoney(999.5);
    expect(result).toContain("999.50");
  });

  it("formats large amounts with Indian grouping (lakhs)", () => {
    const result = formatMoney("100000.00");
    // 1,00,000 in Indian format
    expect(result).toContain("₹");
    expect(result).toContain("00,000.00");
  });

  it("formats invalid string as ₹0.00", () => {
    const result = formatMoney("not-a-number");
    expect(result).toBe("₹0.00");
  });

  it("is distinct from formatPrice for the same value", () => {
    // formatPrice gives ₹1,400 (no decimals); formatMoney gives ₹1,400.00
    expect(formatPrice("1400.00")).toBe("₹1,400");
    expect(formatMoney("1400.00")).toBe("₹1,400.00");
  });
});

// ---- NEW: formatOrderDate ----

describe("formatOrderDate", () => {
  it("formats a UTC ISO string to 'DD Mon YYYY' format", () => {
    // "2026-06-01T10:00:00.000Z" → "01 Jun 2026"
    const result = formatOrderDate("2026-06-01T10:00:00.000Z");
    expect(result).toBe("01 Jun 2026");
  });

  it("formats a different month correctly", () => {
    const result = formatOrderDate("2026-01-15T08:30:00.000Z");
    expect(result).toBe("15 Jan 2026");
  });

  it("returns empty string for an invalid date string", () => {
    expect(formatOrderDate("not-a-date")).toBe("");
  });

  it("returns empty string for an empty string", () => {
    expect(formatOrderDate("")).toBe("");
  });

  it("handles date-only string (no time component)", () => {
    const result = formatOrderDate("2026-12-25");
    // Parsing date-only strings treats them as UTC midnight
    expect(result).toMatch(/25 Dec 2026/);
  });
});

// ---- NEW: formatOrderNumber ----

describe("formatOrderNumber", () => {
  it("extracts the first 8 hex chars of a UUID, uppercased, prefixed with #", () => {
    // "a2224894-..." → "#A2224894"
    const result = formatOrderNumber("a2224894-1234-5678-abcd-ef0123456789");
    expect(result).toBe("#A2224894");
  });

  it("strips dashes before slicing", () => {
    // UUID with leading dashes in first segment: "00000000-..." → "#00000000"
    const result = formatOrderNumber("00000000-0000-0000-0000-000000000000");
    expect(result).toBe("#00000000");
  });

  it("uppercases hex letters a-f", () => {
    const result = formatOrderNumber("abcdef12-3456-7890-abcd-ef0123456789");
    expect(result).toBe("#ABCDEF12");
  });

  it("starts with # character", () => {
    const result = formatOrderNumber("order-uuid-does-not-start-with-hash");
    expect(result.startsWith("#")).toBe(true);
  });

  it("always returns exactly 9 characters (# + 8 hex)", () => {
    const result = formatOrderNumber("ffffffff-0000-0000-0000-000000000000");
    expect(result).toHaveLength(9);
  });

  it("handles a UUID where the first 8 chars of the raw string span the first segment exactly", () => {
    // "12345678-..." → "#12345678"
    expect(formatOrderNumber("12345678-0000-0000-0000-000000000000")).toBe("#12345678");
  });
});

import { describe, it, expect } from "vitest";
import { formatPrice, formatDiscountBadge, titleCase } from "./format";

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

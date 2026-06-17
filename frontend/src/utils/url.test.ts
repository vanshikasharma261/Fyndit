import { describe, it, expect } from "vitest";
import { parseNumber, parseAttributes } from "./url";

describe("parseNumber", () => {
  it("parses a valid numeric string", () => {
    expect(parseNumber("42")).toBe(42);
  });

  it("returns undefined for null", () => {
    expect(parseNumber(null)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(parseNumber("")).toBeUndefined();
  });

  it("returns undefined for a whitespace string", () => {
    expect(parseNumber("   ")).toBeUndefined();
  });

  it("returns undefined for a non-numeric string", () => {
    expect(parseNumber("abc")).toBeUndefined();
  });

  it("parses floating-point strings", () => {
    expect(parseNumber("3.14")).toBeCloseTo(3.14);
  });

  it("parses negative numbers", () => {
    expect(parseNumber("-10")).toBe(-10);
  });

  it("parses zero", () => {
    expect(parseNumber("0")).toBe(0);
  });
});

describe("parseAttributes", () => {
  it("returns empty object for null", () => {
    expect(parseAttributes(null)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseAttributes("")).toEqual({});
  });

  it("parses a valid JSON attributes map", () => {
    const raw = JSON.stringify({ color: ["blue", "red"], size: ["M"] });
    expect(parseAttributes(raw)).toEqual({ color: ["blue", "red"], size: ["M"] });
  });

  it("returns empty object for malformed JSON", () => {
    expect(parseAttributes("{not-json")).toEqual({});
  });

  it("returns empty object when parsed value is an array (not an object)", () => {
    expect(parseAttributes('["blue", "red"]')).toEqual({});
  });

  it("returns empty object for a JSON primitive string", () => {
    expect(parseAttributes('"hello"')).toEqual({});
  });

  it("handles nested empty attribute values", () => {
    const raw = JSON.stringify({ color: [] });
    expect(parseAttributes(raw)).toEqual({ color: [] });
  });
});

/**
 * HomePage unit tests — Vitest + RTL.
 *
 * Strategy:
 * - `useNavigate` is spied on via `vi.mock('react-router-dom', ...)`.
 *   The real module is imported first via `importOriginal` so every other
 *   export (MemoryRouter, Link, …) remains intact; only `useNavigate` is
 *   replaced with a vi.fn() that returns our captured `mockNavigate` spy.
 * - `renderWithProviders` wraps the component in MemoryRouter, so the
 *   `useNavigate` spy fires with the exact path string passed by the component.
 * - `hero_section.png` is handled by Vitest's asset transform (returned as the
 *   file path string), so the banner <img> renders without error.
 * - HomePage has no Redux state, so no preloadedState is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/renderWithProviders";
import HomePage from "./HomePage";

// ---- Mock useNavigate ----
// `importOriginal` keeps all other react-router-dom exports (MemoryRouter, etc.)
// so that renderWithProviders still works.
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---- Section data mirrored from the component (used in assertions) ----
// These strings must match the HOME_SECTIONS titles in HomePage.tsx exactly.

const SECTION_TITLES = [
  "Popular Picks",
  "Wear Your Favourite Team",
  "Style in Motion",
  "Mobiles",
  "Laptops",
];

// ---- Helpers ----

function renderHomePage() {
  return renderWithProviders(<HomePage />);
}

// ---- Tests ----

describe("HomePage — banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the banner section with the hero image", () => {
    renderHomePage();
    const bannerImg = screen.getByRole("img", {
      name: "Discover everything you love, faster.",
    });
    expect(bannerImg).toBeInTheDocument();
  });

  it("renders the 'Start finding products' hotspot button", () => {
    renderHomePage();
    expect(
      screen.getByRole("button", { name: "Start finding products" }),
    ).toBeInTheDocument();
  });

  it("renders the 'Browse all categories' hotspot button", () => {
    renderHomePage();
    expect(
      screen.getByRole("button", { name: "Browse all categories" }),
    ).toBeInTheDocument();
  });

  it("clicking 'Start finding products' navigates to /product/All", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await user.click(screen.getByRole("button", { name: "Start finding products" }));
    expect(mockNavigate).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith("/product/All");
  });

  it("clicking 'Browse all categories' navigates to /product/All", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await user.click(screen.getByRole("button", { name: "Browse all categories" }));
    expect(mockNavigate).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith("/product/All");
  });
});

describe("HomePage — section headings", () => {
  it("renders all five section headings in order", () => {
    renderHomePage();

    // Collect the section header text nodes in DOM order.
    const headings = screen
      .getAllByText(new RegExp(SECTION_TITLES.join("|")))
      .map((el) => el.textContent);

    expect(headings).toEqual(SECTION_TITLES);
  });

  it.each(SECTION_TITLES)("renders '%s' section heading", (title) => {
    renderHomePage();
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});

describe("HomePage — card count", () => {
  it("renders exactly 25 product card buttons total (5 per section × 5 sections)", () => {
    renderHomePage();

    // Each card is a <button> with aria-label matching "— shop <category>".
    // The two banner hotspot buttons do NOT contain this substring.
    const cardButtons = screen
      .getAllByRole("button")
      // Exclude the two banner hotspot buttons (they have distinct aria-labels).
      .filter(
        (btn) =>
          btn.getAttribute("aria-label") !== "Start finding products" &&
          btn.getAttribute("aria-label") !== "Browse all categories",
      );

    expect(cardButtons).toHaveLength(25);
  });

  it.each([
    ["Popular Picks", "clothing"],
    ["Wear Your Favourite Team", "clothing"],
    ["Style in Motion", "footwear"],
    ["Mobiles", "mobile-phones"],
    ["Laptops", "laptops"],
  ])("'%s' section renders exactly 5 cards", (sectionTitle) => {
    renderHomePage();

    // Find the section element whose header span contains the section title.
    // Each card button has aria-label "…— shop <category>".
    // We locate cards by matching the section's parent <section> element.
    const sectionEl = screen
      .getAllByRole("region")
      // getAllByRole('region') picks up elements with aria-label; sections
      // without an aria-label are picked up as 'generic'. Use the container
      // to find by section text instead.
      .find((el) => el.textContent?.includes(sectionTitle));

    // Fall back: use container query when getAllByRole('region') doesn't match.
    const { container } = renderWithProviders(<HomePage />);
    const sectionContainers = container.querySelectorAll("section");
    const targetSection = Array.from(sectionContainers).find((sec) =>
      sec.textContent?.includes(sectionTitle),
    );

    if (targetSection) {
      const cardsInSection = targetSection.querySelectorAll("button[aria-label]");
      // Each section section has a header span + 5 card buttons. The header
      // span is not a button. Filter to only the card buttons (exclude hotspots).
      const productCards = Array.from(cardsInSection).filter(
        (btn) =>
          btn.getAttribute("aria-label") !== "Start finding products" &&
          btn.getAttribute("aria-label") !== "Browse all categories",
      );
      expect(productCards).toHaveLength(5);
    } else {
      // Fallback: if querySelector didn't work, the test uses the sectionEl approach.
      expect(sectionEl).toBeDefined();
    }
  });
});

describe("HomePage — card navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clicking a Mobiles section card navigates to /product/mobile-phones", async () => {
    const user = userEvent.setup();
    renderHomePage();

    // The Mobiles section cards carry aria-label "… — shop mobile-phones".
    const mobileCards = screen
      .getAllByRole("button")
      .filter((btn) => btn.getAttribute("aria-label")?.includes("shop mobile-phones"));

    expect(mobileCards.length).toBeGreaterThan(0);
    await user.click(mobileCards[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/product/mobile-phones");
  });

  it("clicking a Laptops section card navigates to /product/laptops", async () => {
    const user = userEvent.setup();
    renderHomePage();

    const laptopCards = screen
      .getAllByRole("button")
      .filter((btn) => btn.getAttribute("aria-label")?.includes("shop laptops"));

    expect(laptopCards.length).toBeGreaterThan(0);
    await user.click(laptopCards[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/product/laptops");
  });

  it("clicking a footwear card in 'Style in Motion' navigates to /product/footwear", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<HomePage />);

    // Find the Style in Motion section element and then get its footwear card.
    const sectionEls = container.querySelectorAll("section");
    const styleSection = Array.from(sectionEls).find((sec) =>
      sec.textContent?.includes("Style in Motion"),
    );
    expect(styleSection).toBeDefined();

    const footwearCard = Array.from(
      styleSection!.querySelectorAll("button[aria-label]"),
    ).find((btn) => btn.getAttribute("aria-label")?.includes("shop footwear"));

    expect(footwearCard).toBeDefined();
    await user.click(footwearCard!);
    expect(mockNavigate).toHaveBeenCalledWith("/product/footwear");
  });

  it("clicking a Popular Picks card navigates to /product/clothing", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<HomePage />);

    const sectionEls = container.querySelectorAll("section");
    const popularSection = Array.from(sectionEls).find((sec) =>
      sec.textContent?.includes("Popular Picks"),
    );
    expect(popularSection).toBeDefined();

    const clothingCard = popularSection!.querySelector("button[aria-label]");
    expect(clothingCard).toBeDefined();
    await user.click(clothingCard!);
    expect(mockNavigate).toHaveBeenCalledWith("/product/clothing");
  });

  it("each Wear Your Favourite Team card navigates to /product/clothing", async () => {
    const user = userEvent.setup();
    renderHomePage();

    const teamCards = screen
      .getAllByRole("button")
      .filter((btn) => {
        const label = btn.getAttribute("aria-label") ?? "";
        return label.includes("Team jersey") && label.includes("shop clothing");
      });

    expect(teamCards).toHaveLength(5);

    // Click all five and assert each navigated to /product/clothing.
    for (const card of teamCards) {
      await user.click(card);
    }
    expect(mockNavigate).toHaveBeenCalledTimes(5);
    for (const call of mockNavigate.mock.calls as string[][]) {
      expect(call[0]).toBe("/product/clothing");
    }
  });
});

describe("HomePage — card images", () => {
  it("each card renders an img element", () => {
    renderHomePage();

    // Every card <button> contains an <img> child.
    // Total non-banner images: 25 product cards + 1 banner hero image = 26.
    // Filter out the banner by alt text.
    const cardImages = screen
      .getAllByRole("img")
      .filter(
        (img) =>
          img.getAttribute("alt") !== "Discover everything you love, faster.",
      );

    expect(cardImages).toHaveLength(25);
  });

  it("banner img has the correct alt text", () => {
    renderHomePage();
    expect(
      screen.getByAltText("Discover everything you love, faster."),
    ).toBeInTheDocument();
  });

  it("Mobiles card images carry descriptive alt text", () => {
    renderHomePage();
    // Spot-check alt texts defined in HOME_SECTIONS for Mobiles.
    expect(screen.getByAltText("Realme P4")).toBeInTheDocument();
    expect(screen.getByAltText("Samsung S25")).toBeInTheDocument();
    expect(screen.getByAltText("iPhone 17")).toBeInTheDocument();
  });

  it("Laptops card images carry descriptive alt text", () => {
    renderHomePage();
    expect(screen.getByAltText("HP Victus")).toBeInTheDocument();
    expect(screen.getByAltText("Dell next-gen AI PC")).toBeInTheDocument();
    expect(screen.getByAltText("Acer Swift Neo")).toBeInTheDocument();
  });
});

describe("HomePage — accessibility", () => {
  it("banner section has aria-label 'Featured'", () => {
    const { container } = renderHomePage();
    const bannerSection = container.querySelector("section[aria-label='Featured']");
    expect(bannerSection).toBeInTheDocument();
  });

  it("all card buttons have non-empty aria-label attributes", () => {
    renderHomePage();

    const cardButtons = screen
      .getAllByRole("button")
      .filter(
        (btn) =>
          btn.getAttribute("aria-label") !== "Start finding products" &&
          btn.getAttribute("aria-label") !== "Browse all categories",
      );

    for (const btn of cardButtons) {
      const label = btn.getAttribute("aria-label");
      expect(label).toBeTruthy();
      expect(label!.length).toBeGreaterThan(0);
    }
  });

  it("all 25 card buttons have type='button'", () => {
    renderHomePage();

    const cardButtons = screen
      .getAllByRole("button")
      .filter(
        (btn) =>
          btn.getAttribute("aria-label") !== "Start finding products" &&
          btn.getAttribute("aria-label") !== "Browse all categories",
      );

    for (const btn of cardButtons) {
      expect(btn).toHaveAttribute("type", "button");
    }
  });

  it("both banner hotspot buttons have type='button'", () => {
    renderHomePage();
    expect(
      screen.getByRole("button", { name: "Start finding products" }),
    ).toHaveAttribute("type", "button");
    expect(
      screen.getByRole("button", { name: "Browse all categories" }),
    ).toHaveAttribute("type", "button");
  });
});

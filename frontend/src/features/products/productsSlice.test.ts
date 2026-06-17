import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import productsReducer, {
  clearProductDetail,
  fetchProducts,
  fetchFilters,
  fetchProductDetail,
} from "./productsSlice";
import type { ProductsState } from "./types";
import type {
  ProductListResponse,
  ProductFiltersResponse,
  ProductDetailResponse,
} from "../../types/product.types";

// ---- Mock the service so no real fetch happens ----
vi.mock("./productService", () => ({
  productService: {
    list: vi.fn(),
    filters: vi.fn(),
    detail: vi.fn(),
  },
}));

import { productService } from "./productService";

const mockProductService = productService as {
  list: ReturnType<typeof vi.fn>;
  filters: ReturnType<typeof vi.fn>;
  detail: ReturnType<typeof vi.fn>;
};

const mockListResponse: ProductListResponse = {
  items: [
    {
      product_id: "prod-1",
      product_name: "Blue Denim Jacket",
      slug: "blue-denim-jacket",
      brand: "Levi's",
      description: "Classic denim jacket",
      price: "2999.00",
      discount: "300.00",
      image_url: "/assets/products/blue-denim-jacket/1.jpg",
      category_slug: "fashion",
    },
  ],
  meta: { page: 1, limit: 12, total: 1, total_pages: 1 },
};

const mockFiltersResponse: ProductFiltersResponse = {
  price: { min: "999.00", max: "5999.00" },
  attributes: [
    { name: "color", label: "Color", values: ["blue", "black"] },
    { name: "size", label: "Size", values: ["S", "M", "L"] },
  ],
};

const mockDetailResponse: ProductDetailResponse = {
  product_id: "prod-1",
  product_name: "Blue Denim Jacket",
  slug: "blue-denim-jacket",
  brand: "Levi's",
  description: "Classic denim jacket in blue",
  category: { category_id: "cat-1", category_name: "Fashion", slug: "fashion" },
  variants: [
    {
      product_variant_id: "var-1",
      sku: "BDJ-S-BLU",
      stock: 10,
      price: "2999.00",
      discount: "300.00",
      attributes: { color: "blue", size: "S" },
      images: [
        { image_url: "/assets/products/blue-denim-jacket/1.jpg", alt_text: "Front view", is_primary: true },
      ],
    },
  ],
};

function makeStore(preloaded?: Partial<ProductsState>) {
  return configureStore({
    reducer: { products: productsReducer },
    preloadedState: preloaded ? { products: preloaded as ProductsState } : undefined,
  });
}

describe("productsSlice — initial state", () => {
  it("has the correct initial shape", () => {
    const store = makeStore();
    const state = store.getState().products;

    expect(state.items).toEqual([]);
    expect(state.meta).toBeNull();
    expect(state.listLoading).toBe(false);
    expect(state.listError).toBeNull();
    expect(state.filters).toBeNull();
    expect(state.filtersLoading).toBe(false);
    expect(state.detail).toBeNull();
    expect(state.detailLoading).toBe(false);
    expect(state.detailError).toBeNull();
  });
});

describe("productsSlice — clearProductDetail", () => {
  it("clears the detail and detailError", () => {
    const store = makeStore({
      items: [],
      meta: null,
      listLoading: false,
      listError: null,
      filters: null,
      filtersLoading: false,
      detail: mockDetailResponse,
      detailLoading: false,
      detailError: "Previous error",
    });

    store.dispatch(clearProductDetail());

    const state = store.getState().products;
    expect(state.detail).toBeNull();
    expect(state.detailError).toBeNull();
  });
});

describe("productsSlice — fetchProducts thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets listLoading=true and clears listError while pending", () => {
    const store = makeStore();
    mockProductService.list.mockReturnValue(new Promise(() => {}));
    store.dispatch(fetchProducts({ category: "All" }));

    const state = store.getState().products;
    expect(state.listLoading).toBe(true);
    expect(state.listError).toBeNull();
  });

  it("populates items and meta on success", async () => {
    const store = makeStore();
    mockProductService.list.mockResolvedValue({ ok: true, data: mockListResponse });

    await store.dispatch(fetchProducts({ category: "fashion" }));

    const state = store.getState().products;
    expect(state.listLoading).toBe(false);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].product_name).toBe("Blue Denim Jacket");
    expect(state.meta?.total).toBe(1);
  });

  it("clears items and sets error on rejection", async () => {
    const store = makeStore();
    mockProductService.list.mockResolvedValue({
      ok: false,
      data: { statusCode: 500, message: "Internal Server Error" },
    });

    await store.dispatch(fetchProducts({ category: "All" }));

    const state = store.getState().products;
    expect(state.listLoading).toBe(false);
    expect(state.items).toEqual([]);
    expect(state.meta).toBeNull();
    expect(state.listError).toBe("Internal Server Error");
  });

  it("sets network error message when fetch throws", async () => {
    const store = makeStore();
    mockProductService.list.mockRejectedValue(new Error("Offline"));

    await store.dispatch(fetchProducts({ category: "All" }));

    const state = store.getState().products;
    expect(state.listError).toBe(
      "Unable to reach the server. Please check your connection.",
    );
  });
});

describe("productsSlice — fetchFilters thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets filtersLoading=true while pending", () => {
    const store = makeStore();
    mockProductService.filters.mockReturnValue(new Promise(() => {}));
    store.dispatch(fetchFilters({ category: "fashion" }));
    expect(store.getState().products.filtersLoading).toBe(true);
  });

  it("populates filters on success", async () => {
    const store = makeStore();
    mockProductService.filters.mockResolvedValue({ ok: true, data: mockFiltersResponse });

    await store.dispatch(fetchFilters({ category: "fashion" }));

    const state = store.getState().products;
    expect(state.filtersLoading).toBe(false);
    expect(state.filters?.attributes).toHaveLength(2);
    expect(state.filters?.price.min).toBe("999.00");
  });

  it("clears filters on rejection", async () => {
    const store = makeStore({
      items: [],
      meta: null,
      listLoading: false,
      listError: null,
      filters: mockFiltersResponse,
      filtersLoading: false,
      detail: null,
      detailLoading: false,
      detailError: null,
    });
    mockProductService.filters.mockResolvedValue({
      ok: false,
      data: { statusCode: 500, message: "Server Error" },
    });

    await store.dispatch(fetchFilters({ category: "fashion" }));

    const state = store.getState().products;
    expect(state.filtersLoading).toBe(false);
    expect(state.filters).toBeNull();
  });
});

describe("productsSlice — fetchProductDetail thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets detailLoading=true and clears detail+error while pending", () => {
    const store = makeStore();
    mockProductService.detail.mockReturnValue(new Promise(() => {}));
    store.dispatch(fetchProductDetail("blue-denim-jacket"));

    const state = store.getState().products;
    expect(state.detailLoading).toBe(true);
    expect(state.detail).toBeNull();
    expect(state.detailError).toBeNull();
  });

  it("populates detail on success", async () => {
    const store = makeStore();
    mockProductService.detail.mockResolvedValue({ ok: true, data: mockDetailResponse });

    await store.dispatch(fetchProductDetail("blue-denim-jacket"));

    const state = store.getState().products;
    expect(state.detailLoading).toBe(false);
    expect(state.detail?.product_name).toBe("Blue Denim Jacket");
    expect(state.detail?.variants).toHaveLength(1);
  });

  it("sets detailError on rejection", async () => {
    const store = makeStore();
    mockProductService.detail.mockResolvedValue({
      ok: false,
      data: { statusCode: 404, message: "Product not found" },
    });

    await store.dispatch(fetchProductDetail("nonexistent-slug"));

    const state = store.getState().products;
    expect(state.detailLoading).toBe(false);
    expect(state.detail).toBeNull();
    expect(state.detailError).toBe("Product not found");
  });

  it("sets network error when fetch throws", async () => {
    const store = makeStore();
    mockProductService.detail.mockRejectedValue(new Error("Offline"));

    await store.dispatch(fetchProductDetail("some-slug"));

    const state = store.getState().products;
    expect(state.detailError).toBe(
      "Unable to reach the server. Please check your connection.",
    );
  });
});

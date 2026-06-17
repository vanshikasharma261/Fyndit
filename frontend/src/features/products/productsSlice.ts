import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { productService } from "./productService";
import type { ProductsState } from "./types";
import { ProductMessages } from "../../constants/messages.constant";
import { NETWORK_ERROR_STATUS } from "../../constants/values.constant";
import type {
  ListProductsParams,
  ProductDetailResponse,
  ProductErrorResponse,
  ProductFiltersResponse,
  ProductListResponse,
} from "../../types/product.types";

const initialState: ProductsState = {
  items: [],
  meta: null,
  listLoading: false,
  listError: null,

  filters: null,
  filtersLoading: false,

  detail: null,
  detailLoading: false,
  detailError: null,
};

/** Envelope used when `fetch` itself throws (offline/DNS/CORS). */
const networkError: ProductErrorResponse = {
  statusCode: NETWORK_ERROR_STATUS,
  message: ProductMessages.networkError,
};

/** Pull a human-readable message out of an error envelope. */
function errorMessage(payload: ProductErrorResponse | undefined): string {
  return payload?.message ?? ProductMessages.genericError;
}

// ----- Thunks -----

export const fetchProducts = createAsyncThunk<
  ProductListResponse,
  ListProductsParams,
  { rejectValue: ProductErrorResponse }
>("products/fetchProducts", async (params, { rejectWithValue }) => {
  try {
    const { ok, data } = await productService.list(params);
    if (ok) return data as ProductListResponse;
    return rejectWithValue(data as ProductErrorResponse);
  } catch {
    return rejectWithValue(networkError);
  }
});

export const fetchFilters = createAsyncThunk<
  ProductFiltersResponse,
  { category: string; search?: string },
  { rejectValue: ProductErrorResponse }
>("products/fetchFilters", async ({ category, search }, { rejectWithValue }) => {
  try {
    const { ok, data } = await productService.filters(category, search);
    if (ok) return data as ProductFiltersResponse;
    return rejectWithValue(data as ProductErrorResponse);
  } catch {
    return rejectWithValue(networkError);
  }
});

export const fetchProductDetail = createAsyncThunk<
  ProductDetailResponse,
  string,
  { rejectValue: ProductErrorResponse }
>("products/fetchProductDetail", async (slug, { rejectWithValue }) => {
  try {
    const { ok, data } = await productService.detail(slug);
    if (ok) return data as ProductDetailResponse;
    return rejectWithValue(data as ProductErrorResponse);
  } catch {
    return rejectWithValue(networkError);
  }
});

const productsSlice = createSlice({
  name: "products",
  initialState,
  reducers: {
    /** Clear the loaded detail (e.g. when leaving the preview page). */
    clearProductDetail(state) {
      state.detail = null;
      state.detailError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // ----- Listing -----
      .addCase(fetchProducts.pending, (state) => {
        state.listLoading = true;
        state.listError = null;
      })
      .addCase(
        fetchProducts.fulfilled,
        (state, action: PayloadAction<ProductListResponse>) => {
          state.listLoading = false;
          state.items = action.payload.items;
          state.meta = action.payload.meta;
        },
      )
      .addCase(fetchProducts.rejected, (state, action) => {
        state.listLoading = false;
        state.items = [];
        state.meta = null;
        state.listError = errorMessage(action.payload);
      })
      // ----- Facets -----
      .addCase(fetchFilters.pending, (state) => {
        state.filtersLoading = true;
      })
      .addCase(
        fetchFilters.fulfilled,
        (state, action: PayloadAction<ProductFiltersResponse>) => {
          state.filtersLoading = false;
          state.filters = action.payload;
        },
      )
      .addCase(fetchFilters.rejected, (state) => {
        state.filtersLoading = false;
        state.filters = null;
      })
      // ----- Detail -----
      .addCase(fetchProductDetail.pending, (state) => {
        state.detailLoading = true;
        state.detailError = null;
        state.detail = null;
      })
      .addCase(
        fetchProductDetail.fulfilled,
        (state, action: PayloadAction<ProductDetailResponse>) => {
          state.detailLoading = false;
          state.detail = action.payload;
        },
      )
      .addCase(fetchProductDetail.rejected, (state, action) => {
        state.detailLoading = false;
        state.detailError = errorMessage(action.payload);
      });
  },
});

export const { clearProductDetail } = productsSlice.actions;
export default productsSlice.reducer;

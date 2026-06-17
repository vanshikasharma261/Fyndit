import React from "react";
import { render } from "@testing-library/react";
import type { RenderOptions } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import type { PreloadedState } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import productsReducer from "../features/products/productsSlice";
import userReducer from "../features/user/userSlice";
import type { RootState } from "../store/store";

/**
 * Creates a fresh test store with optional preloaded state slices.
 */
export function createTestStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: {
      auth: authReducer,
      products: productsReducer,
      user: userReducer,
    },
    preloadedState: preloadedState as PreloadedState<RootState>,
  });
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  preloadedState?: Partial<RootState>;
  initialRoute?: string;
}

/**
 * Wraps a component in the Redux store provider and a MemoryRouter.
 * Use `preloadedState` to seed specific Redux slice states for testing.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    preloadedState,
    initialRoute = "/",
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) {
  const store = createTestStore(preloadedState);

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

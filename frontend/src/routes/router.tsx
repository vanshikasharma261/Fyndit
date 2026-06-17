import { createBrowserRouter } from "react-router-dom";
import MainLayout from "../layouts/MainLayout/MainLayout";
import HomePage from "../pages/Home/HomePage";
import LoginPage from "../pages/Login/LoginPage";
import SignupPage from "../pages/Signup/SignupPage";
import ProductsPage from "../pages/Products/ProductsPage";
import ProductDetailPage from "../pages/ProductDetail/ProductDetailPage";
import ProfilePage from "../pages/Profile/ProfilePage";
import PlaceholderPage from "../pages/Placeholder/PlaceholderPage";
import RequireAuth from "./RequireAuth";

/**
 * Application routes.
 *
 * - `/login` and `/signup` are public and standalone (their own full-screen
 *   layouts) — they do NOT render inside `MainLayout`.
 * - Every content route requires an authenticated session: they sit behind
 *   `RequireAuth`, which redirects to /login when there is no live session
 *   (logged out, never signed in, or a mid-session 401). Inside the guard they
 *   render under `MainLayout` so the navbar + footer persist while only the
 *   `<Outlet />` content changes.
 */
export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/signup",
    element: <SignupPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/",
        element: <MainLayout />,
        children: [
          { index: true, element: <HomePage /> },
          // `detail/:slug` is declared before `:category` so it is not swallowed.
          { path: "product/detail/:slug", element: <ProductDetailPage /> },
          { path: "product/:category", element: <ProductsPage /> },
          // Profile/Orders/Cart land as full features later; routed now so the
          // navbar profile menu has real targets.
          { path: "profile", element: <ProfilePage /> },
          { path: "orders", element: <PlaceholderPage title="Orders" /> },
          { path: "cart", element: <PlaceholderPage title="Cart" /> },
        ],
      },
    ],
  },
]);

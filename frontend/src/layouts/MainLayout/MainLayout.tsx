import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ChevronDown,
  Menu,
  Search,
  ShoppingCart,
  User,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { logoutUser } from "../../features/auth/authSlice";
import {
  FOOTER_SHOP_LINKS,
  NAV_LINKS,
  SELECT_CATEGORIES,
} from "../../constants/categories";
import { SEARCH_DEBOUNCE_MS } from "../../constants/values.constant";
import styles from "./MainLayout.module.css";

/**
 * Persistent application shell: announcement bar + navbar, the routed page via
 * `<Outlet />`, and the footer. Wraps content routes only — the auth pages
 * render standalone outside this layout.
 */
function MainLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, authChecked, user } = useAppSelector(
    (state) => state.auth,
  );

  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") ?? "";

  // Remember the last category the user browsed *without* an active search, so
  // clearing the search can return them there.
  const lastCategoryRef = useRef<string>("All");
  useEffect(() => {
    const match = location.pathname.match(/^\/product\/([^/]+)$/);
    if (match && !urlSearch) {
      const slug = decodeURIComponent(match[1]);
      if (slug.toLowerCase() !== "all") lastCategoryRef.current = slug;
    }
  }, [location.pathname, urlSearch]);

  // Keep the box in sync with the URL so a search/refresh/category-click is
  // reflected (the URL is the source of truth for the active query). Synced
  // during render — not in an effect — per the React "adjust state on prop
  // change" pattern.
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [syncedSearch, setSyncedSearch] = useState(urlSearch);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  if (urlSearch !== syncedSearch) {
    setSyncedSearch(urlSearch);
    setSearchTerm(urlSearch);
  }

  const handleLogout = async () => {
    setProfileOpen(false);
    // Redirect to login regardless of outcome — the client session is being
    // torn down either way; the slice records any server-side failure message.
    await dispatch(logoutUser());
    navigate("/login");
  };

  // Debounced search-as-you-type: a short pause after typing navigates to the
  // search results (no Enter needed). Clearing an active search returns to the
  // last browsed category (or all products). No-ops when the box already
  // matches the URL (incl. the URL→box sync).
  useEffect(() => {
    const term = searchTerm.trim();
    if (term === urlSearch) return;
    const timer = setTimeout(() => {
      if (term === "") {
        const previous = lastCategoryRef.current;
        navigate(`/product/${previous || "All"}`);
      } else {
        navigate(`/product/All?search=${encodeURIComponent(term)}`);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm, urlSearch, navigate]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchTerm.trim();
    if (!term) return;
    // Global search spans every category via the `All` scope. Enter submits
    // immediately, bypassing the debounce.
    navigate(`/product/All?search=${encodeURIComponent(term)}`);
  };

  const handleSelectCategory = (slug: string) => {
    setCategoryOpen(false);
    navigate(`/product/${slug}`);
  };

  return (
    <div className={styles.shell}>
      <div className={styles.announcement}>
        <span>Free Standard Shipping on orders above ₹500.00</span>
        <span className={styles.announcementMeta}>India · English</span>
      </div>

      <header className={styles.navbar}>
        <Link to="/" className={styles.logo} aria-label="Fyndit home">
          Fynd<span className={styles.logoAccent}>it</span>
        </Link>

        <div className={styles.categoryWrap}>
          <button
            type="button"
            className={styles.categoryButton}
            aria-haspopup="true"
            aria-expanded={categoryOpen}
            onClick={() => setCategoryOpen((open) => !open)}
          >
            <Menu size={18} aria-hidden="true" />
            Select Category
            <ChevronDown size={16} aria-hidden="true" className={styles.caret} />
          </button>

          {categoryOpen && (
            <ul className={styles.categoryMenu} role="menu">
              {SELECT_CATEGORIES.map((category) => (
                <li key={category.slug} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.categoryMenuItem}
                    onClick={() => handleSelectCategory(category.slug)}
                  >
                    {category.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className={styles.nav} aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link key={link.label} to={link.to} className={styles.navLink}>
              {link.label}
            </Link>
          ))}
        </nav>

        <form className={styles.search} onSubmit={handleSearch} role="search">
          <Search
            size={18}
            aria-hidden="true"
            className={styles.searchIcon}
          />
          <input
            type="search"
            placeholder="Search products..."
            aria-label="Search products"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </form>

        <div className={styles.actions}>
          {/* Wait for the session check so we don't flash "Sign In" for a
              logged-in user on refresh. */}
          {authChecked && isAuthenticated ? (
            <div className={styles.profileWrap}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen((open) => !open)}
              >
                <User size={22} aria-hidden="true" />
              </button>

              {profileOpen && (
                <>
                  <div
                    className={styles.menuBackdrop}
                    onClick={() => setProfileOpen(false)}
                    aria-hidden="true"
                  />
                  <ul className={styles.profileMenu} role="menu">
                    {user && (
                      <li role="none" className={styles.profileMenuHeader}>
                        <span className={styles.profileName}>
                          {user.first_name} {user.last_name}
                        </span>
                        <span className={styles.profileEmail}>{user.email}</span>
                      </li>
                    )}
                    <li role="none">
                      <Link
                        to="/profile"
                        role="menuitem"
                        className={styles.profileMenuItem}
                        onClick={() => setProfileOpen(false)}
                      >
                        My Profile
                      </Link>
                    </li>
                    <li role="none">
                      <Link
                        to="/orders"
                        role="menuitem"
                        className={styles.profileMenuItem}
                        onClick={() => setProfileOpen(false)}
                      >
                        Orders
                      </Link>
                    </li>
                    <li role="none">
                      <Link
                        to="/cart"
                        role="menuitem"
                        className={styles.profileMenuItem}
                        onClick={() => setProfileOpen(false)}
                      >
                        Cart
                      </Link>
                    </li>
                    <li role="none" className={styles.profileMenuDivider}>
                      <button
                        type="button"
                        role="menuitem"
                        className={`${styles.profileMenuItem} ${styles.logoutItem}`}
                        onClick={handleLogout}
                      >
                        Logout
                      </button>
                    </li>
                  </ul>
                </>
              )}
            </div>
          ) : authChecked ? (
            <Link to="/login" className={styles.actionButton}>
              Sign In
            </Link>
          ) : null}
          <Link to="/cart" className={styles.cartButton} aria-label="Cart">
            <ShoppingCart size={22} aria-hidden="true" />
            <span className={styles.cartBadge}>0</span>
          </Link>
        </div>
      </header>

      <main className={styles.content}>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrandCol}>
            <span className={styles.footerLogo}>
              Fynd<span className={styles.logoAccent}>it</span>
            </span>
            <p className={styles.footerTagline}>
              A cleaner, faster way to discover and shop the products you love.
            </p>
          </div>

          <div className={styles.footerCol}>
            <h4 className={styles.footerHeading}>Shop</h4>
            {FOOTER_SHOP_LINKS.map((link) => (
              <Link key={link.slug} to={`/product/${link.slug}`}>
                {link.label}
              </Link>
            ))}
          </div>

          <div className={styles.footerCol}>
            <h4 className={styles.footerHeading}>Company</h4>
            <Link to="/">About</Link>
            <Link to="/">Careers</Link>
            <Link to="/">Contact</Link>
          </div>

          <div className={styles.footerCol}>
            <h4 className={styles.footerHeading}>Support</h4>
            <Link to="/">Help Center</Link>
            <Link to="/">Shipping</Link>
            <Link to="/">Returns</Link>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>© 2026 Fyndit. All rights reserved.</span>
          <div className={styles.footerLegal}>
            <Link to="/">Privacy</Link>
            <Link to="/">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default MainLayout;

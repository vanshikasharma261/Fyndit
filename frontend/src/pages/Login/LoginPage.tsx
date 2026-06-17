import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  clearAuthFeedback,
  fetchCurrentUser,
  loginUser,
} from "../../features/auth/authSlice";
import styles from "./Login.module.css";

/** Navigation state set by the signup page after a successful registration. */
interface LoginLocationState {
  registered?: boolean;
}

/**
 * Login page. Matches `login_ui.png`: a centered card with the Fyndit wordmark,
 * email + password fields, the accent Sign In button and a Sign up link.
 * On success the user is redirected to the homepage.
 */
function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, isAuthenticated, errors, message, success } = useAppSelector(
    (state) => state.auth,
  );

  const [form, setForm] = useState({ email: "", password: "" });
  const justRegistered = Boolean(
    (location.state as LoginLocationState | null)?.registered,
  );

  // Reset any feedback left over from a previous auth screen.
  useEffect(() => {
    dispatch(clearAuthFeedback());
  }, [dispatch]);

  // Redirect home once authenticated.
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleChange =
    (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await dispatch(loginUser(form));
    // On success, pull the profile so the navbar menu shows the name/email.
    if (loginUser.fulfilled.match(result)) {
      void dispatch(fetchCurrentUser());
    }
  };

  // A 400 would be unusual for login, but surface field errors if present.
  const fieldError = (field: string) => errors?.[field];
  // Non-validation failures (401) arrive as a single message.
  const formError = !errors && !success ? message : null;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.brandHeader}>
          <span className={styles.logo} aria-hidden="true">
            Fynd<span className={styles.logoAccent}>it</span>
          </span>
          <h1 className={styles.subtitle}>Sign in to your account</h1>
        </header>

        <form
          className={styles.card}
          onSubmit={handleSubmit}
          aria-busy={loading}
          noValidate
        >
          {justRegistered && !formError && (
            <div className={styles.formSuccess} role="status">
              Account created successfully. Please sign in.
            </div>
          )}

          {formError && (
            <div className={styles.formError} role="alert">
              {formError}
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={styles.input}
              value={form.email}
              onChange={handleChange("email")}
              aria-invalid={Boolean(fieldError("email"))}
              aria-describedby={fieldError("email") ? "email-error" : undefined}
              required
            />
            {fieldError("email") && (
              <span id="email-error" className={styles.fieldError}>
                {fieldError("email")}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              className={styles.input}
              value={form.password}
              onChange={handleChange("password")}
              aria-invalid={Boolean(fieldError("password"))}
              aria-describedby={
                fieldError("password") ? "password-error" : undefined
              }
              required
            />
            {fieldError("password") && (
              <span id="password-error" className={styles.fieldError}>
                {fieldError("password")}
              </span>
            )}
          </div>

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <div className={styles.divider}>
            <span>or</span>
          </div>

          <p className={styles.switchLine}>
            Don&apos;t have an account?{" "}
            <Link to="/signup" className={styles.switchLink}>
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;

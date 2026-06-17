import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { clearAuthFeedback, signupUser } from "../../features/auth/authSlice";
import type { AddressType, SignupRequest } from "../../types/auth.types";
import { INDIAN_STATES, SUPPORTED_COUNTRY } from "../../constants/location";
import styles from "./Signup.module.css";

const ADDRESS_TYPES: AddressType[] = ["HOME", "WORK", "OTHER"];

type SignupForm = Required<Omit<SignupRequest, "address_type">> & {
  address_type: AddressType;
};

const INITIAL_FORM: SignupForm = {
  first_name: "",
  last_name: "",
  user_name: "",
  email: "",
  password: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  country: SUPPORTED_COUNTRY,
  zip: "",
  address_type: "HOME",
};

/**
 * Signup page. Follows `signup_ui.png` (split brand panel + form) and adds the
 * address section required because backend signup creates a default address.
 * Country defaults to India. On success the user is redirected to Login.
 */
function SignupPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, errors, message, success } = useAppSelector(
    (state) => state.auth,
  );

  const [form, setForm] = useState<SignupForm>(INITIAL_FORM);

  useEffect(() => {
    dispatch(clearAuthFeedback());
  }, [dispatch]);

  const handleChange =
    (field: keyof SignupForm) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement
      >,
    ) => {
      const { value } = event.target;
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Drop empty optional fields so `forbidNonWhitelisted` / optional rules pass.
    const payload: SignupRequest = {
      ...form,
      line2: form.line2.trim() === "" ? undefined : form.line2,
    };

    const result = await dispatch(signupUser(payload));
    if (signupUser.fulfilled.match(result)) {
      navigate("/login", { replace: true, state: { registered: true } });
    }
  };

  const fieldError = (field: string) => errors?.[field];
  const formError = !errors && !success ? message : null;

  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel}>
        <div className={styles.brandPanelInner}>
          <span className={styles.logo}>
            Fynd<span className={styles.logoAccent}>it</span>
          </span>
          <p className={styles.brandSubtitle}>Create your Account</p>
        </div>
      </aside>

      <section className={styles.formPanel}>
        <div className={styles.formWrap}>
          <header className={styles.formHeader}>
            <h1 className={styles.heading}>Get started</h1>
            <p className={styles.subheading}>
              <span className={styles.subheadingAccent}>Fill</span> in the
              details below to create your account.
            </p>
          </header>

          <form
            className={styles.form}
            onSubmit={handleSubmit}
            aria-busy={loading}
            noValidate
          >
            {formError && (
              <div className={styles.formError} role="alert">
                {formError}
              </div>
            )}

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Account</legend>

              <Field
                id="email"
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@gmail.com"
                value={form.email}
                onChange={handleChange("email")}
                error={fieldError("email")}
                required
              />

              <Field
                id="password"
                label="Password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter your password"
                value={form.password}
                onChange={handleChange("password")}
                error={fieldError("password")}
                required
              />

              <div className={styles.row}>
                <Field
                  id="first_name"
                  label="First Name"
                  placeholder="First Name"
                  autoComplete="given-name"
                  value={form.first_name}
                  onChange={handleChange("first_name")}
                  error={fieldError("first_name")}
                  required
                />
                <Field
                  id="last_name"
                  label="Last Name"
                  placeholder="Last Name"
                  autoComplete="family-name"
                  value={form.last_name}
                  onChange={handleChange("last_name")}
                  error={fieldError("last_name")}
                  required
                />
              </div>

              <Field
                id="user_name"
                label="Username"
                placeholder="Enter Username"
                autoComplete="username"
                value={form.user_name}
                onChange={handleChange("user_name")}
                error={fieldError("user_name")}
                required
              />

              <Field
                id="phone"
                label="Phone"
                type="tel"
                placeholder="Enter Phone Number"
                autoComplete="tel"
                value={form.phone}
                onChange={handleChange("phone")}
                error={fieldError("phone")}
                required
              />
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Default Address</legend>

              <Field
                id="line1"
                label="Address Line 1"
                placeholder="House no, street, area"
                autoComplete="address-line1"
                value={form.line1}
                onChange={handleChange("line1")}
                error={fieldError("line1")}
                required
              />

              <Field
                id="line2"
                label="Address Line 2 (optional)"
                placeholder="Apartment, landmark"
                autoComplete="address-line2"
                value={form.line2}
                onChange={handleChange("line2")}
                error={fieldError("line2")}
              />

              <div className={styles.row}>
                <Field
                  id="city"
                  label="City"
                  placeholder="City"
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={handleChange("city")}
                  error={fieldError("city")}
                  required
                />

                <div className={styles.field}>
                  <label htmlFor="state" className={styles.label}>
                    State
                  </label>
                  <select
                    id="state"
                    className={styles.input}
                    value={form.state}
                    onChange={handleChange("state")}
                    aria-invalid={Boolean(fieldError("state"))}
                    aria-describedby={
                      fieldError("state") ? "state-error" : undefined
                    }
                    required
                  >
                    <option value="" disabled>
                      Select state
                    </option>
                    {INDIAN_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                  {fieldError("state") && (
                    <span id="state-error" className={styles.fieldError}>
                      {fieldError("state")}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="country" className={styles.label}>
                    Country
                  </label>
                  <select
                    id="country"
                    className={styles.input}
                    value={form.country}
                    onChange={handleChange("country")}
                    aria-invalid={Boolean(fieldError("country"))}
                    aria-describedby={
                      fieldError("country") ? "country-error" : undefined
                    }
                    required
                  >
                    <option value={SUPPORTED_COUNTRY}>
                      {SUPPORTED_COUNTRY}
                    </option>
                  </select>
                  {fieldError("country") && (
                    <span id="country-error" className={styles.fieldError}>
                      {fieldError("country")}
                    </span>
                  )}
                </div>

                <Field
                  id="zip"
                  label="Zip Code"
                  placeholder="6-digit PIN"
                  autoComplete="postal-code"
                  value={form.zip}
                  onChange={handleChange("zip")}
                  error={fieldError("zip")}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="address_type" className={styles.label}>
                  Address Type
                </label>
                <select
                  id="address_type"
                  className={styles.input}
                  value={form.address_type}
                  onChange={handleChange("address_type")}
                >
                  {ADDRESS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0) + type.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>

            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? "Creating account..." : "Sign Up"}
            </button>

            <p className={styles.switchLine}>
              Already have an account?{" "}
              <Link to="/login" className={styles.switchLink}>
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  required?: boolean;
}

/** Small labelled text input used across the signup form. */
function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  error,
  required = false,
}: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={styles.input}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        required={required}
      />
      {error && (
        <span id={errorId} className={styles.fieldError}>
          {error}
        </span>
      )}
    </div>
  );
}

export default SignupPage;

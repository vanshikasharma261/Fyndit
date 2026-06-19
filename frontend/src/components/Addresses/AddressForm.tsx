import { useState } from "react";
import type { FormEvent } from "react";
import { AddressMessages } from "../../constants/messages.constant";
import { INDIAN_STATES, SUPPORTED_COUNTRY } from "../../constants/location";
import type {
  AddressResponse,
  AddressType,
  CreateAddressRequest,
  FieldValidationErrors,
} from "../../types/address.types";
import styles from "./Addresses.module.css";

interface AddressFormProps {
  mode: "add" | "edit";
  /** Pre-fills the form in edit mode. */
  initial?: AddressResponse;
  /** A submit is in flight (disables the controls). */
  saving: boolean;
  /** Per-field validation errors from the last rejected submit. */
  errors: FieldValidationErrors | null;
  onSubmit: (payload: CreateAddressRequest) => void;
  onCancel: () => void;
}

const ADDRESS_TYPES: AddressType[] = ["HOME", "WORK", "OTHER"];

/**
 * Add/edit address form. Replaces the panel body (matches
 * `address_add_form_ui.png` / `address_update_form_ui.png`). State is a dropdown
 * of `INDIAN_STATES` and country is fixed to India, mirroring the backend DTO.
 * Per-field validation errors render inline beneath each field with the errored
 * input red-bordered (matches `validation_error_address_update.png`).
 */
function AddressForm({
  mode,
  initial,
  saving,
  errors,
  onSubmit,
  onCancel,
}: AddressFormProps) {
  const [addressType, setAddressType] = useState<AddressType>(
    initial?.address_type ?? "HOME",
  );
  const [line1, setLine1] = useState(initial?.line1 ?? "");
  const [line2, setLine2] = useState(initial?.line2 ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [zip, setZip] = useState(initial?.zip ?? "");

  const errorFor = (field: string): string | undefined => errors?.[field];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: CreateAddressRequest = {
      address_type: addressType,
      line1: line1.trim(),
      city: city.trim(),
      state,
      country: SUPPORTED_COUNTRY,
      zip: zip.trim(),
    };
    const trimmedLine2 = line2.trim();
    // On edit, always send line2 (even empty) so a cleared value persists;
    // on add, omit it when blank so the column is stored as null.
    if (mode === "edit") {
      payload.line2 = trimmedLine2;
    } else if (trimmedLine2) {
      payload.line2 = trimmedLine2;
    }
    onSubmit(payload);
  };

  /** Renders the reserved inline error slot for a field. */
  const fieldError = (field: string) => {
    const message = errorFor(field);
    if (!message) return null;
    return (
      <span id={`address-${field}-error`} className={styles.errorText} role="alert">
        <span aria-hidden="true">↑</span>
        {message}
      </span>
    );
  };

  const inputClass = (field: string) =>
    `${styles.input} ${errorFor(field) ? styles.inputError : ""}`;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {/* ----- Address type ----- */}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Address Type</span>
        <div className={styles.typeGroup} role="group" aria-label="Address Type">
          {ADDRESS_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`${styles.typePill} ${addressType === type ? styles.typePillActive : ""}`}
              aria-pressed={addressType === type}
              onClick={() => setAddressType(type)}
            >
              {type}
            </button>
          ))}
        </div>
        {fieldError("address_type")}
      </div>

      {/* ----- Line 1 ----- */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="address-line1">
          Line 1
        </label>
        <input
          id="address-line1"
          className={inputClass("line1")}
          value={line1}
          onChange={(event) => setLine1(event.target.value)}
          placeholder="House No."
          aria-invalid={Boolean(errorFor("line1"))}
          aria-describedby={errorFor("line1") ? "address-line1-error" : undefined}
        />
        {fieldError("line1")}
      </div>

      {/* ----- Line 2 ----- */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="address-line2">
          Line 2
        </label>
        <input
          id="address-line2"
          className={inputClass("line2")}
          value={line2}
          onChange={(event) => setLine2(event.target.value)}
          placeholder="Street Line"
          aria-invalid={Boolean(errorFor("line2"))}
          aria-describedby={errorFor("line2") ? "address-line2-error" : undefined}
        />
        {fieldError("line2")}
      </div>

      {/* ----- City ----- */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="address-city">
          City
        </label>
        <input
          id="address-city"
          className={inputClass("city")}
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="City"
          aria-invalid={Boolean(errorFor("city"))}
          aria-describedby={errorFor("city") ? "address-city-error" : undefined}
        />
        {fieldError("city")}
      </div>

      {/* ----- State ----- */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="address-state">
          State
        </label>
        <select
          id="address-state"
          className={`${styles.select} ${errorFor("state") ? styles.inputError : ""}`}
          value={state}
          onChange={(event) => setState(event.target.value)}
          aria-invalid={Boolean(errorFor("state"))}
          aria-describedby={errorFor("state") ? "address-state-error" : undefined}
        >
          <option value="" disabled>
            Select State
          </option>
          {INDIAN_STATES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {fieldError("state")}
      </div>

      {/* ----- Country (fixed) ----- */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="address-country">
          Country
        </label>
        <input
          id="address-country"
          className={styles.input}
          value={SUPPORTED_COUNTRY}
          disabled
          readOnly
        />
      </div>

      {/* ----- Zip ----- */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="address-zip">
          Zip Code
        </label>
        <input
          id="address-zip"
          className={inputClass("zip")}
          value={zip}
          onChange={(event) => setZip(event.target.value)}
          placeholder="Zip Code"
          inputMode="numeric"
          aria-invalid={Boolean(errorFor("zip"))}
          aria-describedby={errorFor("zip") ? "address-zip-error" : undefined}
        />
        {fieldError("zip")}
      </div>

      {/* ----- Actions ----- */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onCancel}
          disabled={saving}
        >
          {AddressMessages.cancel}
        </button>
        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {mode === "add"
            ? AddressMessages.saveAdd
            : AddressMessages.saveUpdate}
        </button>
      </div>
    </form>
  );
}

export default AddressForm;

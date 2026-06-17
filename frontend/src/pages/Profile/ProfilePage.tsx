import { useEffect, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  clearUserFeedback,
  fetchUser,
  updateUser,
} from "../../features/user/userSlice";
import { UserMessages } from "../../constants/messages.constant";
import type { EditableField, UserProfile } from "../../types/user.types";
import styles from "./Profile.module.css";

/** The editable rows, in display order, with their uppercase labels. */
const PROFILE_FIELDS: { field: EditableField; label: string }[] = [
  { field: "first_name", label: "First Name" },
  { field: "last_name", label: "Last Name" },
  { field: "user_name", label: "User Name" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
];

/**
 * Profile page. Left "Manage Your Profile" panel with per-row inline editing
 * (pencil → input + green tick → confirm); right "Addresses" panel is a static
 * placeholder until the address feature ships. Matches `profile_ui.png`,
 * `profile_edit_ui.png` and `profile_edit_error_ui.png`.
 */
function ProfilePage() {
  const dispatch = useAppDispatch();
  const { profile, loading, success, message, errors } = useAppSelector(
    (state) => state.user,
  );

  // Which row is being edited (only one at a time) and its working value.
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void dispatch(fetchUser());
    // Drop any feedback left over from a previous visit.
    return () => {
      dispatch(clearUserFeedback());
    };
  }, [dispatch]);

  const beginEdit = (field: EditableField, current: string) => {
    dispatch(clearUserFeedback());
    setEditingField(field);
    setDraft(current);
  };

  const cancelEdit = () => {
    dispatch(clearUserFeedback());
    setEditingField(null);
  };

  const handleDraftChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    field: EditableField,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmEdit(field);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  };

  const confirmEdit = async (field: EditableField) => {
    const result = await dispatch(updateUser({ [field]: draft.trim() }));
    // Only leave edit mode on success — on a validation failure the row stays
    // open so the error renders beneath it with the accent border intact.
    if (updateUser.fulfilled.match(result)) {
      setEditingField(null);
    }
  };

  const valueOf = (field: EditableField, data: UserProfile): string =>
    data[field] ?? "";

  return (
    <div className={styles.page}>
      {message && (
        <div
          className={`${styles.toast} ${success ? styles.toastSuccess : styles.toastError}`}
          role={success ? "status" : "alert"}
          onClick={() => dispatch(clearUserFeedback())}
        >
          <span className={styles.toastIcon} aria-hidden="true">
            {success ? "✓" : "✕"}
          </span>
          <span>{message}</span>
        </div>
      )}

      <div className={styles.columns}>
        {/* ----- Manage Your Profile ----- */}
        <section className={styles.card}>
          <h2 className={styles.heading}>Manage Your Profile</h2>

          {!profile && loading && (
            <p className={styles.status}>{UserMessages.loading}</p>
          )}

          {profile && (
            <div className={styles.rows}>
              {PROFILE_FIELDS.map(({ field, label }) => {
                const isEditing = editingField === field;
                const fieldError = isEditing ? errors?.[field] : undefined;
                return (
                  <div key={field} className={styles.rowWrap}>
                    <div
                      className={`${styles.row} ${isEditing ? styles.rowEditing : ""}`}
                    >
                      <span className={styles.label}>{label}:</span>

                      {isEditing ? (
                        <input
                          className={styles.input}
                          value={draft}
                          onChange={handleDraftChange}
                          onKeyDown={(event) => handleKeyDown(event, field)}
                          aria-label={label}
                          aria-invalid={Boolean(fieldError)}
                          aria-describedby={
                            fieldError ? `${field}-error` : undefined
                          }
                          autoFocus
                        />
                      ) : (
                        <span className={styles.value}>
                          {valueOf(field, profile) || "—"}
                        </span>
                      )}

                      {isEditing ? (
                        <button
                          type="button"
                          className={styles.confirmBtn}
                          onClick={() => void confirmEdit(field)}
                          disabled={loading}
                          aria-label={`Save ${label}`}
                        >
                          <Check size={18} strokeWidth={2.5} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() =>
                            beginEdit(field, valueOf(field, profile))
                          }
                          aria-label={`Edit ${label}`}
                        >
                          <Pencil size={16} strokeWidth={2} />
                        </button>
                      )}
                    </div>

                    {/* Reserve space so the inline error doesn't shift rows. */}
                    <span
                      id={`${field}-error`}
                      className={styles.fieldError}
                      role={fieldError ? "alert" : undefined}
                    >
                      {fieldError ?? ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ----- Addresses (placeholder until the address feature ships) ----- */}
        <section className={styles.card}>
          <h2 className={styles.heading}>Addresses</h2>

          <div className={styles.addressCard} aria-hidden="true">
            <div className={styles.addressTop}>
              <span className={styles.addressBadge}>Work Address</span>
              <div className={styles.addressActions}>
                <Pencil size={16} strokeWidth={2} />
                <Trash2 size={16} strokeWidth={2} />
              </div>
            </div>
            <p className={styles.addressLine1}>#120-D</p>
            <p className={styles.addressLine2}>Sarojni Colony, Model Town</p>

            <div className={styles.addressMeta}>
              <div className={styles.addressMetaCol}>
                <span className={styles.addressMetaLabel}>City</span>
                <span className={styles.addressMetaValue}>Yamuna Nagar</span>
              </div>
              <div className={styles.addressMetaCol}>
                <span className={styles.addressMetaLabel}>State</span>
                <span className={styles.addressMetaValue}>Haryana</span>
              </div>
              <span className={styles.zipChip}>Zip Code: 135001</span>
            </div>
          </div>

          <div className={styles.addAddress} aria-hidden="true">
            Add Address
          </div>

          <p className={styles.addressNote}>
            Address management is coming soon.
          </p>
        </section>
      </div>
    </div>
  );
}

export default ProfilePage;

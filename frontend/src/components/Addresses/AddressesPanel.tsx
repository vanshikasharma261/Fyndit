import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  addAddress,
  clearAddressErrors,
  fetchAddresses,
  isAddressValidationError,
  removeAddress,
  setDefaultAddress,
  updateAddress,
} from "../../features/address/addressSlice";
import { AddressMessages } from "../../constants/messages.constant";
import { MAX_ACTIVE_ADDRESSES } from "../../constants/values.constant";
import AddressCard from "./AddressCard";
import AddressForm from "./AddressForm";
import type {
  AddressErrorResponse,
  AddressResponse,
  CreateAddressRequest,
} from "../../types/address.types";
import styles from "./Addresses.module.css";

/** Panel view: the address list, or the add/edit form. */
type Mode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; address: AddressResponse };

/**
 * Toast a non-validation failure. Validation errors (400) are rendered inline in
 * the form (the slice already stored the per-field map), so they are skipped
 * here to avoid a duplicate toast.
 */
function toastError(rejected: unknown): void {
  const payload = rejected as AddressErrorResponse | undefined;
  if (payload && isAddressValidationError(payload)) return;
  toast.error(payload?.message ?? AddressMessages.genericError);
}

/**
 * The live Addresses panel rendered inside the Profile page's right card. Owns
 * the list ⇄ add/edit form toggle. Operational outcomes are surfaced as toasts;
 * form validation errors render inline. The "Add Address" button hides once the
 * `MAX_ACTIVE_ADDRESSES` limit is reached (the backend is the real guard).
 */
function AddressesPanel() {
  const dispatch = useAppDispatch();
  const { items, loading, saving, mutatingId, errors } = useAppSelector(
    (state) => state.address,
  );
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  useEffect(() => {
    void dispatch(fetchAddresses());
    return () => {
      dispatch(clearAddressErrors());
    };
  }, [dispatch]);

  const openAdd = () => {
    dispatch(clearAddressErrors());
    setMode({ kind: "add" });
  };

  const openEdit = (address: AddressResponse) => {
    dispatch(clearAddressErrors());
    setMode({ kind: "edit", address });
  };

  const closeForm = () => {
    dispatch(clearAddressErrors());
    setMode({ kind: "list" });
  };

  const handleSubmit = (payload: CreateAddressRequest) => {
    if (mode.kind === "add") {
      void dispatch(addAddress(payload))
        .unwrap()
        .then(() => {
          toast.success(AddressMessages.addSuccess);
          setMode({ kind: "list" });
        })
        .catch(toastError);
    } else if (mode.kind === "edit") {
      void dispatch(
        updateAddress({ addressId: mode.address.address_id, payload }),
      )
        .unwrap()
        .then(() => {
          toast.success(AddressMessages.updateSuccess);
          setMode({ kind: "list" });
        })
        .catch(toastError);
    }
  };

  const handleRemove = (address: AddressResponse) => {
    void dispatch(removeAddress(address.address_id))
      .unwrap()
      .then(() => toast.success(AddressMessages.removeSuccess))
      .catch(toastError);
  };

  const handleSetDefault = (address: AddressResponse) => {
    void dispatch(setDefaultAddress(address.address_id))
      .unwrap()
      .then(() => toast.success(AddressMessages.defaultSuccess))
      .catch(toastError);
  };

  // ----- Form mode -----
  if (mode.kind === "add" || mode.kind === "edit") {
    return (
      <AddressForm
        key={mode.kind === "edit" ? mode.address.address_id : "add"}
        mode={mode.kind}
        initial={mode.kind === "edit" ? mode.address : undefined}
        saving={saving}
        errors={errors}
        onSubmit={handleSubmit}
        onCancel={closeForm}
      />
    );
  }

  // ----- List mode -----
  if (loading && items.length === 0) {
    return <p className={styles.status}>{AddressMessages.loading}</p>;
  }

  return (
    <div className={styles.list}>
      {items.length === 0 && (
        <p className={styles.empty}>{AddressMessages.empty}</p>
      )}

      {items.map((address) => (
        <AddressCard
          key={address.address_id}
          address={address}
          busy={mutatingId === address.address_id}
          onEdit={openEdit}
          onRemove={handleRemove}
          onSetDefault={handleSetDefault}
        />
      ))}

      {items.length < MAX_ACTIVE_ADDRESSES ? (
        <button type="button" className={styles.addButton} onClick={openAdd}>
          <Plus size={18} aria-hidden="true" />
          {AddressMessages.addAddress}
        </button>
      ) : (
        <p className={styles.limitNote}>{AddressMessages.limitNote}</p>
      )}
    </div>
  );
}

export default AddressesPanel;

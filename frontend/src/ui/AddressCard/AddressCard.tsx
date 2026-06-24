import { Check, Pencil, Star, Trash2 } from "lucide-react";
import styles from "./AddressCard.module.css";

export interface Address {
  address_type: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
  is_default?: boolean;
}

export interface AddressCardProps {
  address: Address;
  /** This card's remove / set-default is in flight (disables its controls). */
  busy?: boolean;
  onEdit?: (address: Address) => void;
  onRemove?: (address: Address) => void;
  onSetDefault?: (address: Address) => void;
}

/**
 * One saved address. Shows the type badge, a "Default" badge when applicable,
 * edit/remove icons, the address lines, and (for non-default cards) a
 * "Set as default" action.
 */
function AddressCard({
  address,
  busy = false,
  onEdit,
  onRemove,
  onSetDefault,
}: AddressCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.badges}>
          <span className={styles.badge}>{address.address_type}</span>
          {address.is_default && (
            <span className={styles.defaultBadge}>
              <Check size={12} strokeWidth={3} aria-hidden="true" />
              Default
            </span>
          )}
        </div>

        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => onEdit?.(address)}
            disabled={busy}
            aria-label={`Edit ${address.address_type.toLowerCase()} address`}
          >
            <Pencil size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.danger}`}
            onClick={() => onRemove?.(address)}
            disabled={busy}
            aria-label={`Remove ${address.address_type.toLowerCase()} address`}
          >
            <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className={styles.line1}>{address.line1}</p>
      {address.line2 && <p className={styles.line2}>{address.line2}</p>}

      <div className={styles.meta}>
        <div className={styles.metaCol}>
          <span className={styles.metaLabel}>City</span>
          <span className={styles.metaValue}>{address.city}</span>
        </div>
        <div className={styles.metaCol}>
          <span className={styles.metaLabel}>State</span>
          <span className={styles.metaValue}>{address.state}</span>
        </div>
        <span className={styles.zipChip}>ZIP: {address.zip}</span>
      </div>

      {!address.is_default && (
        <div className={styles.cardFooter}>
          <button
            type="button"
            className={styles.setDefaultBtn}
            onClick={() => onSetDefault?.(address)}
            disabled={busy}
          >
            <Star size={14} aria-hidden="true" />
            Set as default
          </button>
        </div>
      )}
    </article>
  );
}

export default AddressCard;

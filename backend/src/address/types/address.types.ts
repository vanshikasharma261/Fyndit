import { AddressType } from '../../generated/prisma/enums';

/**
 * Public address contract returned to the client. Deliberately excludes
 * ownership/internal columns (`user_id`, `is_removed`, `removed_at`,
 * timestamps) — they must never leak in a response.
 */
export interface AddressResponse {
  address_id: string;
  address_type: AddressType;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  zip: string;
  is_default: boolean;
}

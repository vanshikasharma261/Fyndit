/**
 * Centralised, human-facing response messages.
 *
 * Every controller/service response message must be sourced from here so copy
 * stays consistent and is changed in exactly one place.
 */

export const AuthMessages = {
  signupSuccessMessage: 'Account created successfully',
  loginSuccessMessage: 'Logged in successfully',
  logoutSuccessMessage: 'Logged out successfully',

  emailAlreadyExistsMessage: 'An account with this email already exists',
  // Used for bad credentials AND soft-deleted accounts to avoid enumeration.
  invalidCredentialsMessage: 'Invalid email or password',
  unauthorizedMessage: 'Authentication required',
  // Authenticated but the account is not in an active session (logged out/soft-deleted).
  inactiveAccountMessage: 'Your account is not active. Please log in again.',
} as const;

export const UserMessages = {
  updateSuccess: 'Profile updated successfully',
  deleteSuccess: 'Your account has been deleted',
  // Surfaced as a field error on `email` when a profile email change collides.
  emailAlreadyExists: 'An account with this email already exists',
} as const;

export const CartMessages = {
  updateSuccess: 'Cart updated successfully',
  removeSuccess: 'Item removed from cart',
  // Stock / availability failures (400).
  outOfStock: 'This item is out of stock',
  exceedsStock: 'Requested quantity exceeds the available stock',
  maxQuantityReached: 'You can add at most 20 of this item to your cart',
  productUnavailable: 'This product is no longer available',
  // The cart already holds the maximum number of distinct items (400).
  cartFull:
    'Your cart is full. Please checkout or remove an item before adding more.',
  // Ownership / lookup failure (404).
  cartItemNotFound: 'Cart item not found',
} as const;

export const AddressMessages = {
  addSuccess: 'Address added successfully',
  updateSuccess: 'Address updated successfully',
  removeSuccess: 'Address removed successfully',
  defaultSuccess: 'Default address updated',
  // The user already has the maximum number of active addresses (400).
  limitReached: 'You can save at most 5 addresses',
  // Ownership / lookup failure (404).
  notFound: 'Address not found',
} as const;

export const ProductMessages = {
  productNotFound: 'Product not found',
  invalidAttributesFilter:
    'The attributes filter must be a JSON object mapping each attribute to an array of strings',
} as const;

export const ValidationMessages = {
  emailInvalid: 'Please provide a valid email address',
  passwordWeak:
    'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character',
  phoneInvalid: 'Phone number must be exactly 10 digits',
  zipInvalid: 'Zip code must be exactly 6 digits',
  stateInvalid: 'Please provide a valid Indian state',
  countryInvalid: 'Country must be India',
} as const;

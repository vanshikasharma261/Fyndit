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

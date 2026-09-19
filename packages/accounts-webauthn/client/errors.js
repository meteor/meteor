import { Meteor } from 'meteor/meteor';

// Codes raised by @simplewebauthn/browser mapped to the codes this package
// exposes. Anything else becomes `webauthn-ceremony-failed`, or
// `webauthn-not-allowed` when the browser reported a NotAllowedError (the
// user cancelled, the request timed out, or the key refused).
const BROWSER_ERROR_CODES = {
  ERROR_CEREMONY_ABORTED: 'webauthn-ceremony-aborted',
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'webauthn-credential-in-use',
  ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT:
    'webauthn-user-verification-unsupported',
  ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT:
    'webauthn-discoverable-credential-unsupported',
  ERROR_INVALID_DOMAIN: 'webauthn-invalid-domain',
  ERROR_INVALID_RP_ID: 'webauthn-invalid-domain',
};

/**
 * Converts the `WebAuthnError` thrown by `@simplewebauthn/browser` (or a raw
 * DOM exception) into a `Meteor.Error` with a stable `error` code for the UI
 * to branch on. The original code and DOM exception name travel in `details`.
 * @param {Error} error The error thrown by the browser ceremony.
 * @returns {Meteor.Error}
 */
export function normalizeWebAuthnError(error) {
  if (error instanceof Meteor.Error) {
    return error;
  }
  const domName = error?.cause?.name || error?.name;
  let code = BROWSER_ERROR_CODES[error?.code];
  if (!code && domName === 'NotAllowedError') {
    code = 'webauthn-not-allowed';
  }
  return new Meteor.Error(
    code || 'webauthn-ceremony-failed',
    error?.message || 'WebAuthn ceremony failed',
    { code: error?.code, name: domName }
  );
}

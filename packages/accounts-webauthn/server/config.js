import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

const DEFAULT_TIMEOUT_MS = 60 * 1000;
const REQUIREMENT_VALUES = ['required', 'preferred', 'discouraged'];
const ALLOWED_VALUES = {
  attestationType: ['none', 'direct', 'enterprise'],
  authenticatorAttachment: ['platform', 'cross-platform'],
  residentKey: REQUIREMENT_VALUES,
  userVerification: REQUIREMENT_VALUES,
  secondFactorUserVerification: REQUIREMENT_VALUES,
};

/**
 * Resolves the effective WebAuthn configuration. It is evaluated on every call
 * rather than cached: `Accounts.config()` usually runs inside `Meteor.startup`,
 * after this module has loaded, and it replaces `Accounts._options.webauthn` as
 * a whole. Values from `Meteor.settings.packages.accounts.webauthn` are merged
 * underneath so a partial `Accounts.config()` call keeps the rest.
 * @returns {Object} The relying party settings with defaults applied.
 * @throws {Error} When an option has an invalid value.
 */
export function getWebAuthnConfig() {
  const options = {
    ...Meteor.settings?.packages?.accounts?.webauthn,
    ...Accounts._options?.webauthn,
  };

  for (const [key, allowed] of Object.entries(ALLOWED_VALUES)) {
    if (options[key] !== undefined && !allowed.includes(options[key])) {
      throw new Error(
        `Accounts.config: invalid webauthn.${key} "${options[key]}"; expected one of ${allowed.join(', ')}`
      );
    }
  }

  const rootUrl = new URL(Meteor.absoluteUrl());
  const rpID = options.rpID || rootUrl.hostname;
  const origins =
    options.origins === undefined ? [rootUrl.origin] : [].concat(options.origins);
  if (
    origins.length === 0 ||
    !origins.every(origin => typeof origin === 'string' && origin)
  ) {
    throw new Error(
      'Accounts.config: webauthn.origins must be a non-empty string or a non-empty array of strings'
    );
  }
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  if (!(Number.isFinite(timeout) && timeout > 0)) {
    throw new Error(
      `Accounts.config: invalid webauthn.timeout "${options.timeout}"; expected a positive number of milliseconds`
    );
  }
  return {
    rpID,
    rpName: options.rpName || Accounts.emailTemplates?.siteName || rpID,
    origins,
    attestationType: options.attestationType || 'none',
    authenticatorAttachment: options.authenticatorAttachment,
    residentKey: options.residentKey || 'preferred',
    userVerification: options.userVerification || 'required',
    secondFactorUserVerification:
      options.secondFactorUserVerification || 'preferred',
    passwordlessLogin: options.passwordlessLogin !== false,
    timeout,
    requireTotpOnLogin: !!options.requireTotpOnLogin,
  };
}

/**
 * Refuses the passwordless flows (login and key-only sign-up) when
 * `passwordlessLogin` is off. Second-factor use is unaffected.
 * @throws {Meteor.Error} `webauthn-passwordless-disabled`
 */
export function assertPasswordlessLoginEnabled() {
  if (!getWebAuthnConfig().passwordlessLogin) {
    throw new Meteor.Error(
      'webauthn-passwordless-disabled',
      'Passwordless login with a security key is disabled'
    );
  }
}

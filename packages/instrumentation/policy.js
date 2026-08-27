import { EJSON } from 'meteor/ejson';
import { previewValue } from './preview.js';

// Hard-coded denylist of every Accounts DDP method whose args OR result carry a
// secret — passwords/digests, resume & login tokens, OAuth secrets, 2FA secrets
// and codes. Args AND result are dropped for these regardless of config. Audited
// against accounts-base / -password / -2fa / -passwordless; the OAuth provider
// packages register no DDP methods of their own (they log in through `login`).
const ACCOUNTS_DENYLIST = new Set([
  // accounts-base
  'login',                       // credentials in, login token out
  'getNewToken',                 // fresh login token out
  'configureLoginService',       // OAuth service secret in
  // accounts-password
  'createUser',                  // password in, login token out
  'changePassword',              // old/new password digests in
  'forgotPassword',              // account email in
  'resetPassword',               // reset token + new password in
  'verifyEmail',                 // verification token in
  // accounts-2fa
  'generate2faActivationQrCode', // 2FA secret + otpauth URI out
  'enableUser2fa',               // one-time 2FA code in
  // accounts-passwordless
  'requestLoginTokenForUser',    // login-token flow
]);

// Global kill-switch default, read once from the environment: an operator can
// ship the package but silence all emission (e.g. in production, or when a
// third-party library has registered listeners) without a code change.
// configure({ enabled }) overrides it at runtime.
function envDisabled() {
  const v = (process.env.METEOR_INSTRUMENTATION_DISABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

const config = {
  enabled: !envDisabled(),
  captureMethodArgs: false,    // false | 'preview'
  captureMethodResult: false,  // false | 'preview'
  captureClientAddress: false, // include the client IP on ddp.connection.open (PII)
  eventPrefix: '',
};
const perMethod = new Map(); // name -> { captureArgs?, captureResult? }

// 'preview' (or true, accepted as an alias) means a bounded preview — never raw.
const normalizeCapture = (v) => (v === 'preview' || v === true ? 'preview' : false);

export function configure(options) {
  if (!options) return;
  if ('enabled' in options) config.enabled = !!options.enabled;
  if ('captureMethodArgs' in options) config.captureMethodArgs = normalizeCapture(options.captureMethodArgs);
  if ('captureMethodResult' in options) config.captureMethodResult = normalizeCapture(options.captureMethodResult);
  if ('captureClientAddress' in options) config.captureClientAddress = !!options.captureClientAddress;
  if ('eventPrefix' in options) config.eventPrefix = String(options.eventPrefix || '');
}

export const isEnabled = () => config.enabled;

export function configureMethod(name, options) {
  perMethod.set(name, options || {});
}

export const eventPrefix = () => config.eventPrefix;

export const captureClientAddress = () => config.captureClientAddress;

// Resolution order (highest wins): 1. Accounts denylist → nothing · 2. per-method
// captureArgs/captureResult (still bounded by previewValue) · 3. global 'preview'
// → bounded preview · 4. default → nothing. A throwing override yields nothing
// rather than breaking emission.
function resolveCapture(name, value, kind /* 'captureArgs' | 'captureResult' */, globalKey, perMethodOverrides) {
  if (ACCOUNTS_DENYLIST.has(name)) return undefined;
  const m = perMethodOverrides && perMethodOverrides.get(name);
  if (m && typeof m[kind] === 'function') {
    try {
      // Full-fidelity defensive copy: the projector can inspect everything but
      // can never mutate the live invocation (the args the handler is about to
      // receive, or the result about to be sent/returned).
      return previewValue(m[kind](EJSON.clone(value)));
    } catch (_ignored) {
      return undefined;
    }
  }
  if (config[globalKey] === 'preview') return previewValue(value);
  return undefined;
}

export const captureArgs = (name, args) => resolveCapture(name, args, 'captureArgs', 'captureMethodArgs', perMethod);
export const captureResult = (name, result) => resolveCapture(name, result, 'captureResult', 'captureMethodResult', perMethod);
// Publications share the global preview policy (captureMethodArgs is documented
// to cover method AND publication events) but never the per-METHOD overrides:
// a projector configured for a method must not run on a same-named publication.
export const capturePublicationArgs = (name, args) => resolveCapture(name, args, 'captureArgs', 'captureMethodArgs', null);

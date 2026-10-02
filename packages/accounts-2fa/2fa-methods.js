import { Accounts } from 'meteor/accounts-base';
import { Match } from 'meteor/check';
import { Meteor } from 'meteor/meteor';

const MAX_2FA_CODE_LENGTH = 16;
const VERIFIED_MARK_TTL_MS = 10 * 1000;
const LOGIN_TYPES_WITH_2FA = new Set(['password', 'passwordless']);

const verifiedHooks = [];
const challengeHooks = [];
const pendingVerified = new Map();
const loginFactors = new Map();

/** A 2FA code is a short OTP or email code. Login handlers read this at check time. */
Accounts._2faCodeMatch = Match.Where(value =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_2FA_CODE_LENGTH
);

const registerHook = (hooks, fn) => {
  hooks.push(fn);
  return {
    stop() {
      const index = hooks.indexOf(fn);
      if (index >= 0) {
        hooks.splice(index, 1);
      }
    },
  };
};

const runHooks = async (hooks, payload) => {
  for (const hook of [...hooks]) {
    await hook(payload);
  }
};

/**
 * @summary Called from `Accounts.onLogin`, after `validateLoginAttempt` has allowed the login.
 * A thrown error is logged and ignored. Issue a trusted-device token here:
 * a login rejected by a validator never reaches this hook.
 * @locus Server
 * @param {Function} fn Receives `{ user, connection, method }`.
 */
Accounts.on2faVerified = fn => registerHook(verifiedHooks, fn);

/**
 * @summary Called before an email code is sent. Throw to skip the send,
 * for example when the account is locked. The login fails with that error.
 * @locus Server
 * @param {Function} fn Receives `{ user, connection, method }`.
 */
Accounts.validate2faChallenge = fn => registerHook(challengeHooks, fn);

const rememberVerified = (userId, connection, method) => {
  const now = Date.now();
  for (const [id, mark] of pendingVerified) {
    if (now - mark.at > VERIFIED_MARK_TTL_MS) {
      pendingVerified.delete(id);
      loginFactors.delete(id);
    }
  }
  pendingVerified.set(userId, {
    at: now,
    connection: connection || null,
    method,
  });
  // Read by the TOTP replay hook when that package is also loaded.
  // An email acceptance must not be checked as a TOTP step.
  loginFactors.set(userId, { at: now, method });
};

/**
 * @summary Factor accepted for the login in progress, then forgotten.
 * `email` tells the TOTP replay hook to leave the authenticator step alone.
 * @param {String} userId
 * @returns {String|null}
 */
Accounts._2faLoginFactor = userId => {
  const mark = loginFactors.get(userId);
  if (!mark) {
    return null;
  }
  loginFactors.delete(userId);
  if (Date.now() - mark.at > VERIFIED_MARK_TTL_MS) {
    return null;
  }
  return mark.method;
};

Accounts.onLogin(async attempt => {
  const userId = attempt?.user?._id;
  if (!userId || !LOGIN_TYPES_WITH_2FA.has(attempt.type)) {
    return;
  }
  const mark = pendingVerified.get(userId);
  if (!mark) {
    return;
  }
  pendingVerified.delete(userId);
  if (Date.now() - mark.at > VERIFIED_MARK_TTL_MS) {
    return;
  }
  try {
    await runHooks(verifiedHooks, {
      user: attempt.user,
      connection: attempt.connection || mark.connection || null,
      method: mark.method,
    });
  } catch (error) {
    console.error('accounts-2fa: on2faVerified threw', error);
  }
});

const CLIENT_CONTEXT_MAX_KEYS = 8;
const CLIENT_CONTEXT_MAX_KEY = 32;
const CLIENT_CONTEXT_MAX_VALUE = 256;

/** Bounded string map. The DDP connection does not forward cookies. */
Accounts._isValid2faClientContext = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length > CLIENT_CONTEXT_MAX_KEYS) {
    return false;
  }
  return keys.every(key =>
    key.length > 0 &&
    key.length <= CLIENT_CONTEXT_MAX_KEY &&
    typeof value[key] === 'string' &&
    value[key].length <= CLIENT_CONTEXT_MAX_VALUE
  );
};

const twoFactorError = (code, message, details) => {
  const ambiguous = Accounts._options.ambiguousErrorMessages ?? true;
  return new Meteor.Error(
    code,
    ambiguous
      ? 'Something went wrong. Please check your credentials.'
      : message,
    details
  );
};

const listMethods = (user, loginMethod) => {
  const methods = [];
  const otpEnabled = !!Accounts._check2faEnabled?.(user);
  if (otpEnabled) {
    methods.push('otp');
  }
  // Email plus an email-only login is still one factor.
  if (loginMethod === 'passwordless') {
    return methods;
  }
  if (Accounts._2faEmailAvailable?.(user) && (Accounts._2faEmailOffersToOtpUsers() || !otpEnabled)) {
    methods.push('email');
  }
  return methods;
};

/**
 * @summary Whether this login must present a second factor.
 * @locus Server
 * @param {Object} user
 * @param {Object} context
 * @returns {Promise<{required: boolean, availableMethods: string[]}>}
 */
Accounts._is2faRequired = async (user, context = {}) => {
  const availableMethods = listMethods(user, context.loginMethod);
  const fullContext = { ...context, availableMethods };
  const policy = Accounts._options.require2fa;
  const otpEnabled = !!Accounts._check2faEnabled?.(user);
  const emailEnabled = Accounts._is2faEmailEnabled?.() === true;

  if (typeof policy === 'function') {
    try {
      return {
        required: !!(await policy(user._id, fullContext)),
        availableMethods,
      };
    } catch (error) {
      console.error('accounts-2fa: require2fa threw; requiring a second factor', error);
      return { required: true, availableMethods };
    }
  }

  if (policy === false) {
    return { required: otpEnabled, availableMethods };
  }
  if (policy === true) {
    return { required: true, availableMethods };
  }

  // Default: everyone, once an app opts into the email factor. Otherwise only TOTP users.
  return { required: emailEnabled || otpEnabled, availableMethods };
};

const acceptFactor = (user, connection, method) => {
  rememberVerified(user._id, connection, method);
};

/**
 * @summary Apply the 2FA policy to a login that already passed its first factor.
 * @locus Server
 * @param {Object} params
 * @param {Object} params.user
 * @param {String} [params.code]
 * @param {String} [params.method] `otp` or `email`. Omitted: try TOTP, then a pending email code.
 * @param {Object} [params.context]
 * @returns {Promise<Meteor.Error|undefined>} `undefined` when the login may continue.
 */
Accounts._enforce2faOnLogin = async ({ user, code, method, context = {} }) => {
  if (!user) {
    return undefined;
  }

  const { required, availableMethods } = await Accounts._is2faRequired(user, context);
  if (!required) {
    return undefined;
  }

  if (!availableMethods.length) {
    return twoFactorError(
      '2fa-method-unavailable',
      'No second factor is available for this user'
    );
  }

  if (method && !availableMethods.includes(method)) {
    return twoFactorError(
      '2fa-method-unavailable',
      'This second factor is not available'
    );
  }

  if (!code) {
    const sendEmail = availableMethods.includes('email') &&
      (method === 'email' || !availableMethods.includes('otp'));
    let emailSent = false;
    let retryAfterMs = 0;
    if (sendEmail) {
      try {
        await runHooks(challengeHooks, {
          user,
          connection: context.connection || null,
          method: 'email',
        });
      } catch (error) {
        if (error instanceof Meteor.Error) {
          return error;
        }
        return twoFactorError(
          '2fa-challenge-refused',
          'The second factor cannot be sent'
        );
      }
      try {
        const issued = await Accounts._issue2faEmailCode(user);
        emailSent = issued.sent;
        retryAfterMs = issued.retryAfterMs;
      } catch (error) {
        if (error?.error === '2fa-email-failed') {
          return error;
        }
        throw error;
      }
    }
    return twoFactorError(
      'no-2fa-code',
      '2FA code must be informed',
      { methods: availableMethods, emailSent, retryAfterMs }
    );
  }

  if (typeof code === 'string' && code.length > MAX_2FA_CODE_LENGTH) {
    return twoFactorError('invalid-2fa-code', 'Invalid 2FA code');
  }

  const tryOtp = !method || method === 'otp';
  const tryEmail = method === 'email' || (!method && availableMethods.includes('email'));

  if (tryOtp && availableMethods.includes('otp')) {
    const secret = user.services?.twoFactorAuthentication?.secret;
    if (Accounts._isTokenValid(secret, code)) {
      await acceptFactor(user, context.connection, 'otp');
      return undefined;
    }
    if (method === 'otp') {
      return twoFactorError('invalid-2fa-code', 'Invalid 2FA code');
    }
  }

  if (tryEmail && user.services?.twoFactorAuthentication?.emailCode) {
    const valid = await Accounts._verify2faEmailCode(user, code);
    if (valid) {
      await acceptFactor(user, context.connection, 'email');
      return undefined;
    }
  }

  return twoFactorError('invalid-2fa-code', 'Invalid 2FA code');
};

import { Accounts } from 'meteor/accounts-base';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode-svg';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

const validateChangeHooks = [];

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
 * @summary Reject an activation or a deactivation. Throw from the callback to refuse it.
 * @locus Server
 * @param {Function} fn Receives `{ type, user, connection }`. `type` is `activation` or `deactivation`.
 */
Accounts.validate2faChange = fn => registerHook(validateChangeHooks, fn);

const TOTP_ALGORITHM = 'SHA1';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_SECRET_SIZE = 20;
const DEFAULT_WINDOW = 10;
const TWO_FACTOR_METHODS = [
  'generate2faActivationQrCode',
  'enableUser2fa',
  'disableUser2fa',
];

const DEFAULT_CONFIG = {
  window: DEFAULT_WINDOW,
  preventReplay: true,
  requireCodeToDisable: true,
  allowPlaintextSecrets: true,
  rateLimit: { numRequests: 5, timeInterval: 60_000 },
};

let config = { ...DEFAULT_CONFIG };

const changeHooks = [];
const codeFailureHooks = [];

const getOtpSecret = secret => OTPAuth.Secret.fromBase32(secret);

const getTotp = ({ issuer = '', label = 'OTPAuth', secret }) =>
  new OTPAuth.TOTP({
    issuer,
    label,
    secret: typeof secret === 'string' ? getOtpSecret(secret) : secret,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  });

const generateActivationData = ({ issuer, label }) => {
  const secret = new OTPAuth.Secret({ size: TOTP_SECRET_SIZE });
  const totp = getTotp({ issuer, label, secret });

  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
};

/**
 * @summary Configure TOTP verification and replay protection.
 * Call this at startup, before the first 2FA method runs.
 * Defaults stay compatible with previous releases, except replay protection,
 * which is on, and disabling 2FA, which requires a current code.
 * @locus Server
 * @param {Object} options
 * @param {Number} [options.window=10] TOTP steps accepted on each side of the current step.
 * @param {Boolean} [options.preventReplay=true] Reject a code whose time step was already used.
 * @param {Boolean} [options.requireCodeToDisable=true] Require a valid TOTP code to disable 2FA.
 * @param {Boolean} [options.allowPlaintextSecrets=true] Accept secrets stored before encryption was enabled.
 * @param {{numRequests: Number, timeInterval: Number}} [options.rateLimit]
 */
Accounts.configure2fa = options => {
  check(options, {
    window: Match.Optional(Match.Integer),
    preventReplay: Match.Optional(Boolean),
    requireCodeToDisable: Match.Optional(Boolean),
    allowPlaintextSecrets: Match.Optional(Boolean),
    rateLimit: Match.Optional({
      numRequests: Match.Integer,
      timeInterval: Match.Integer,
    }),
  });

  if (options.window !== undefined && options.window < 0) {
    throw new Error('accounts-2fa: window must be >= 0');
  }

  config = {
    ...config,
    ...options,
    rateLimit: options.rateLimit
      ? { ...options.rateLimit }
      : config.rateLimit,
  };
};

/**
 * @summary Called after 2FA is enabled, disabled or reset.
 * @locus Server
 * @param {Function} fn Receives `{ event, userId, connection }`. `event` is `enabled`, `disabled` or `reset`.
 */
Accounts.on2faChange = fn => registerHook(changeHooks, fn);

/**
 * @summary Called when a TOTP code is rejected (login replay, enable, disable).
 * @locus Server
 * @param {Function} fn Receives `{ userId, method }`.
 */
Accounts.on2faCodeFailure = fn => registerHook(codeFailureHooks, fn);

const oauthEncryption = () => Package['oauth-encryption']?.OAuthEncryption;

const encryptSecret = plain => {
  const encryption = oauthEncryption();
  if (!encryption?.keyIsLoaded()) {
    return plain;
  }
  return encryption.seal(plain);
};

const decryptSecret = stored => {
  const encryption = oauthEncryption();
  if (encryption?.isSealed(stored)) {
    if (!encryption.keyIsLoaded()) {
      return null;
    }
    try {
      return encryption.open(stored);
    } catch (error) {
      return null;
    }
  }
  if (typeof stored === 'string' && stored.length > 0 && config.allowPlaintextSecrets) {
    return stored;
  }
  return null;
};

/**
 * @summary Encrypt secrets that are still stored in plaintext.
 * @locus Server
 * @returns {Promise<Number>} Number of users migrated.
 */
Accounts.encryptExisting2faSecrets = async () => {
  if (!oauthEncryption()?.keyIsLoaded()) {
    throw new Error(
      'accounts-2fa: add oauth-encryption and set Accounts.config({ oauthSecretKey }) before encrypting existing secrets'
    );
  }
  const users = await Meteor.users
    .find(
      { 'services.twoFactorAuthentication.secret': { $exists: true } },
      { fields: { 'services.twoFactorAuthentication.secret': 1 } }
    )
    .fetchAsync();

  let migrated = 0;
  for (const user of users) {
    const secret = user.services?.twoFactorAuthentication?.secret;
    if (typeof secret !== 'string') {
      continue;
    }
    await Meteor.users.updateAsync(user._id, {
      $set: { 'services.twoFactorAuthentication.secret': encryptSecret(secret) },
    });
    migrated += 1;
  }
  return migrated;
};

Accounts._check2faEnabled = user => {
  const { services: { twoFactorAuthentication } = {} } = user;
  return !!(
    twoFactorAuthentication &&
    twoFactorAuthentication.secret &&
    twoFactorAuthentication.type === 'otp'
  );
};

Accounts._is2faEnabledForUser = async () => {
  const user = await Meteor.userAsync();
  if (!user) {
    throw new Meteor.Error('no-logged-user', 'No user logged in.');
  }
  return Accounts._check2faEnabled(user);
};

Accounts._generate2faToken = secret => ({
  token: getTotp({ secret: decryptSecret(secret) || secret }).generate(),
});

/**
 * @summary Validate a TOTP code and return the matching time step.
 * @locus Server
 * @param {String} secret Stored secret, plaintext or `v1:` ciphertext.
 * @param {String} code
 * @returns {Number|null}
 */
Accounts._verify2faToken = (secret, code) => {
  if (!Meteor.isServer) {
    throw new Meteor.Error(
      400,
      'The function _verify2faToken can only be called on the server'
    );
  }
  const plain = decryptSecret(secret);
  if (!plain || typeof code !== 'string') {
    return null;
  }
  const now = Date.now();
  try {
    const delta = getTotp({ secret: plain }).validate({
      token: code.replace(/\W+/g, ''),
      window: config.window,
      timestamp: now,
    });
    if (delta === null) {
      return null;
    }
    return Math.floor(now / 1000 / TOTP_PERIOD) + delta;
  } catch (error) {
    return null;
  }
};

Accounts._isTokenValid = (secret, code) =>
  Accounts._verify2faToken(secret, code) !== null;

/**
 * Atomically record a time step. Returns false when that step (or a later one) was already used.
 * @param {String} userId
 * @param {Number} step
 * @param {Object} [extraSet]
 * @returns {Promise<Boolean>}
 */
const consumeStep = async (userId, step, extraSet = {}) => {
  const updated = await Meteor.users.updateAsync(
    {
      _id: userId,
      $or: [
        { 'services.twoFactorAuthentication.lastUsedStep': { $lt: step } },
        { 'services.twoFactorAuthentication.lastUsedStep': { $exists: false } },
      ],
    },
    {
      $set: {
        'services.twoFactorAuthentication.lastUsedStep': step,
        ...extraSet,
      },
    }
  );
  const affected = typeof updated === 'number' ? updated : 0;
  return affected > 0;
};

const rejectInvalidCode = async (userId, method) => {
  await runHooks(codeFailureHooks, { userId, method });
  Accounts._handleError('Invalid 2FA code', true, 'invalid-2fa-code');
};

/**
 * @summary Remove 2FA from a user. Intended for an administrator recovery flow.
 * @locus Server
 * @param {String} userId
 * @param {{connection?: Object}} [options]
 */
Accounts.reset2faForUser = async (userId, options = {}) => {
  check(userId, String);
  await Meteor.users.updateAsync(userId, {
    $unset: { 'services.twoFactorAuthentication': 1 },
  });
  await runHooks(changeHooks, {
    event: 'reset',
    userId,
    connection: options.connection || null,
  });
};

// A replayed login code is rejected here, after the password handler accepted it.
// Throwing sets attempt.error and the following validateLoginAttempt hooks still run.
Accounts.validateLoginAttempt(async attempt => {
  if (!config.preventReplay || attempt.error || attempt.allowed === false) {
    return true;
  }
  const user = attempt.user;
  if (!user || !Accounts._check2faEnabled(user)) {
    return true;
  }
  const loginOptions = attempt.methodArguments?.[0] || {};
  const code = loginOptions.code;
  if (typeof code !== 'string') {
    return true;
  }
  // An email code is not a TOTP step. The client sets twoFactorMethod when it
  // chose email; otherwise the email factor records it on _2faLoginFactor.
  const acceptedFactor = typeof Accounts._2faLoginFactor === 'function'
    ? Accounts._2faLoginFactor(user._id)
    : null;
  if (loginOptions.twoFactorMethod === 'email' || acceptedFactor === 'email') {
    return true;
  }
  const step = Accounts._verify2faToken(
    user.services.twoFactorAuthentication.secret,
    code
  );
  if (step === null) {
    await rejectInvalidCode(user._id, 'login');
  }
  const consumed = await consumeStep(user._id, step);
  if (!consumed) {
    await rejectInvalidCode(user._id, 'login');
  }
  return true;
});

Meteor.methods({
  async generate2faActivationQrCode(appName) {
    check(appName, String);
    const user = await Meteor.userAsync();

    if (!user) {
      throw new Meteor.Error(
        400,
        'There must be a user logged in to generate the QR code.'
      );
    }

    if (Accounts._check2faEnabled(user)) {
      throw new Meteor.Error(
        '2fa-activated',
        'The 2FA is activated. You need to disable the 2FA first before trying to generate a new activation code.'
      );
    }

    await runHooks(validateChangeHooks, {
      type: 'activation',
      user,
      connection: this.connection,
    });

    const emails = user.emails || [];
    const { secret, uri } = generateActivationData({
      issuer: appName.trim(),
      label: user.username || emails[0]?.address || user._id,
    });
    const svg = new QRCode(uri).svg();

    await Meteor.users.updateAsync(
      { _id: user._id },
      {
        $set: {
          'services.twoFactorAuthentication': {
            secret: encryptSecret(secret),
          },
        },
      }
    );

    return { svg, secret, uri };
  },
  async enableUser2fa(code) {
    check(code, String);
    const user = await Meteor.userAsync();

    if (!user) {
      throw new Meteor.Error(400, 'No user logged in.');
    }

    const twoFactorAuthentication = user.services?.twoFactorAuthentication;

    if (!twoFactorAuthentication?.secret) {
      throw new Meteor.Error(
        500,
        'The user does not have a secret generated. You may have to call the function generateSvgCode first.'
      );
    }

    await runHooks(validateChangeHooks, {
      type: 'activation',
      user,
      connection: this.connection,
    });

    const step = Accounts._verify2faToken(twoFactorAuthentication.secret, code);
    if (step === null) {
      await rejectInvalidCode(user._id, 'enableUser2fa');
    }

    const enabled = config.preventReplay
      ? await consumeStep(user._id, step, {
          'services.twoFactorAuthentication.type': 'otp',
        })
      : (await Meteor.users.updateAsync(user._id, {
          $set: { 'services.twoFactorAuthentication.type': 'otp' },
        })) > 0;

    if (!enabled) {
      await rejectInvalidCode(user._id, 'enableUser2fa');
    }

    await runHooks(changeHooks, {
      event: 'enabled',
      userId: user._id,
      connection: this.connection,
    });
  },
  async disableUser2fa(code) {
    if (code !== undefined) {
      check(code, String);
    }
    const user = await Meteor.userAsync();
    const userId = user?._id;

    if (!userId) {
      throw new Meteor.Error(400, 'No user logged in.');
    }

    await runHooks(validateChangeHooks, {
      type: 'deactivation',
      user,
      connection: this.connection,
    });

    if (config.requireCodeToDisable && Accounts._check2faEnabled(user)) {
      const secret = user.services?.twoFactorAuthentication?.secret;
      const step = secret ? Accounts._verify2faToken(secret, code) : null;
      if (step === null) {
        await rejectInvalidCode(userId, 'disableUser2fa');
      }
      if (config.preventReplay) {
        const consumed = await consumeStep(userId, step);
        if (!consumed) {
          await rejectInvalidCode(userId, 'disableUser2fa');
        }
      }
    }

    await Meteor.users.updateAsync(userId, {
      $unset: { 'services.twoFactorAuthentication': 1 },
    });
    await runHooks(changeHooks, {
      event: 'disabled',
      userId,
      connection: this.connection,
    });
  },
  async has2faEnabled() {
    return Accounts._is2faEnabledForUser();
  },
});

let rateLimitApplied = false;
const applyRateLimit = () => {
  if (rateLimitApplied) {
    return;
  }
  rateLimitApplied = true;
  DDPRateLimiter.addRule(
    {
      type: 'method',
      name: name => TWO_FACTOR_METHODS.includes(name),
      userId: () => true,
    },
    config.rateLimit.numRequests,
    config.rateLimit.timeInterval
  );
};

Meteor.startup(applyRateLimit);

Accounts.addAutopublishFields({
  forLoggedInUser: ['services.twoFactorAuthentication.type'],
});

import { Accounts } from 'meteor/accounts-base';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode-svg';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';

const TOTP_ALGORITHM = 'SHA1';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_SECRET_SIZE = 20;
const DEFAULT_WINDOW = 10;

const DEFAULT_CONFIG = {
  window: DEFAULT_WINDOW,
  preventReplay: true,
};

let config = { ...DEFAULT_CONFIG };

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
 * Defaults match previous releases, except that a code cannot be reused.
 * @locus Server
 * @param {Object} options
 * @param {Number} [options.window=10] TOTP steps accepted on each side of the current step.
 * @param {Boolean} [options.preventReplay=true] Reject a code whose time step was already used.
 */
Accounts.configure2fa = options => {
  check(options, {
    window: Match.Optional(Match.Integer),
    preventReplay: Match.Optional(Boolean),
  });

  if (options.window !== undefined && options.window < 0) {
    throw new Error('accounts-2fa: window must be >= 0');
  }

  config = {
    ...config,
    ...options,
  };
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

Accounts._generate2faToken = (secret, timestamp = Date.now()) => ({
  token: getTotp({ secret }).generate({ timestamp }),
});

/**
 * @summary Validate a TOTP code and return the matching time step.
 * @locus Server
 * @param {String} secret
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
  if (typeof secret !== 'string' || !secret || typeof code !== 'string') {
    return null;
  }
  const now = Date.now();
  try {
    const delta = getTotp({ secret }).validate({
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
 * Atomically record a time step. Returns false when that step, or a later one, was already used.
 * `extraSelector` binds the write to the secret that was verified, so a concurrent
 * replacement of that secret is not activated.
 * @param {String} userId
 * @param {Number} step
 * @param {Object} [extraSet]
 * @param {Object} [extraSelector]
 * @returns {Promise<Boolean>}
 */
const consumeStep = async (userId, step, extraSet = {}, extraSelector = {}) => {
  const updated = await Meteor.users.updateAsync(
    {
      _id: userId,
      ...extraSelector,
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

const rejectInvalidCode = () => {
  Accounts._handleError('Invalid 2FA code', true, 'invalid-2fa-code');
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
  const step = Accounts._verify2faToken(
    user.services.twoFactorAuthentication.secret,
    code
  );
  if (step === null) {
    rejectInvalidCode();
  }
  const consumed = await consumeStep(user._id, step);
  if (!consumed) {
    rejectInvalidCode();
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
            secret,
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

    const step = Accounts._verify2faToken(twoFactorAuthentication.secret, code);
    if (step === null) {
      rejectInvalidCode();
    }

    const secretSelector = {
      'services.twoFactorAuthentication.secret': twoFactorAuthentication.secret,
    };
    const enabled = config.preventReplay
      ? await consumeStep(
        user._id,
        step,
        { 'services.twoFactorAuthentication.type': 'otp' },
        secretSelector
      )
      : (await Meteor.users.updateAsync(
        { _id: user._id, ...secretSelector },
        { $set: { 'services.twoFactorAuthentication.type': 'otp' } }
      )) > 0;

    if (!enabled) {
      rejectInvalidCode();
    }
  },
  async disableUser2fa() {
    const userId = Meteor.userId();

    if (!userId) {
      throw new Meteor.Error(400, 'No user logged in.');
    }

    await Meteor.users.updateAsync(
      { _id: userId },
      {
        $unset: {
          'services.twoFactorAuthentication': 1,
        },
      }
    );
  },
  async has2faEnabled() {
    return Accounts._is2faEnabledForUser();
  },
});

Accounts.addAutopublishFields({
  forLoggedInUser: ['services.twoFactorAuthentication.type'],
});

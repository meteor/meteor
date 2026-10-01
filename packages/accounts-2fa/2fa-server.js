import { Accounts } from 'meteor/accounts-base';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode-svg';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';

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
const TOTP_WINDOW = 10;
const TOTP_SECRET_SIZE = 20;

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
 * @summary Configure the second factors offered at login. Call this at startup.
 * @locus Server
 * @param {Object} options
 * @param {Object} [options.email] Email second factor. Disabled until `enabled` is set.
 * @param {Boolean} [options.email.enabled]
 * @param {Boolean} [options.email.offerToOtpUsers=true] Let a user who already has TOTP choose email.
 * @param {Boolean} [options.email.requireVerified=true]
 * @param {Number} [options.email.codeLength=6]
 * @param {Number} [options.email.expirationMs=600000]
 * @param {Number} [options.email.maxAttempts=5]
 * @param {Number} [options.email.resendCooldownMs=60000]
 */
Accounts.configure2fa = options => {
  check(options, {
    email: Match.Optional({
      enabled: Match.Optional(Boolean),
      codeLength: Match.Optional(Match.Integer),
      expirationMs: Match.Optional(Match.Integer),
      maxAttempts: Match.Optional(Match.Integer),
      resendCooldownMs: Match.Optional(Match.Integer),
      requireVerified: Match.Optional(Boolean),
      offerToOtpUsers: Match.Optional(Boolean),
    }),
  });

  if (options.email?.codeLength !== undefined &&
    (options.email.codeLength < 4 || options.email.codeLength > 8)) {
    throw new Error('accounts-2fa: email.codeLength must be between 4 and 8');
  }

  if (options.email) {
    Accounts._configure2faEmail(options.email);
  }
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
  token: getTotp({ secret }).generate(),
});

Accounts._isTokenValid = (secret, code) => {
  if (!Meteor.isServer) {
    throw new Meteor.Error(
      400,
      'The function _isTokenValid can only be called on the server'
    );
  }

  try {
    return getTotp({ secret }).validate({
      token: code.replace(/\W+/g, ''),
      window: TOTP_WINDOW,
    }) !== null;
  } catch (error) {
    return false;
  }
};

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

    const {
      services: { twoFactorAuthentication },
    } = user;

    if (!twoFactorAuthentication || !twoFactorAuthentication.secret) {
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

    if (!Accounts._isTokenValid(twoFactorAuthentication.secret, code)) {
      Accounts._handleError('Invalid 2FA code', true, 'invalid-2fa-code');
    }

    await Meteor.users.updateAsync(
      { _id: user._id },
      {
        $set: {
          'services.twoFactorAuthentication': {
            ...twoFactorAuthentication,
            type: 'otp',
          },
        },
      }
    );
  },
  async disableUser2fa() {
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

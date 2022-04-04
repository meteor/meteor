import { Accounts } from 'meteor/accounts-base';
import twofactor from 'node-2fa';
import QRCode from 'qrcode-svg';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';

Accounts._check2faEnabled = user => {
  const { services: { twoFactorAuthentication } = {} } = user;
  return !!(
    twoFactorAuthentication &&
    twoFactorAuthentication.secret &&
    twoFactorAuthentication.type === 'otp'
  );
};

Accounts._is2faEnabledForUser = () => {
  const user = Meteor.user();
  if (!user) {
    throw new Meteor.Error('no-logged-user', 'No user logged in.');
  }
  return Accounts._check2faEnabled(user);
};

Accounts._generate2faToken = secret => twofactor.generateToken(secret);

Accounts._isTokenValid = (secret, code) => {
  if (!Meteor.isServer) {
    throw new Meteor.Error(
      400,
      'The function _isTokenValid can only be called on the server'
    );
  }
  return twofactor.verifyToken(secret, code, 10) !== null;
};

Meteor.methods({
  generate2faActivationQrCode(appName) {
    check(appName, String);
    const user = Meteor.user();

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
    const { secret, uri } = twofactor.generateSecret({
      name: appName.trim(),
      account: user.username || emails[0]?.address || user._id,
    });
    const svg = new QRCode(uri).svg();

    Meteor.users.update(
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
  enableUser2fa(code) {
    check(code, String);
    const user = Meteor.user();

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
    if (!Accounts._isTokenValid(twoFactorAuthentication.secret, code)) {
      Accounts._handleError('Invalid 2FA code', true, 'invalid-2fa-code');
    }

    Meteor.users.update(
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
  disableUser2fa() {
    const userId = Meteor.userId();

    if (!userId) {
      throw new Meteor.Error(400, 'No user logged in.');
    }

    Meteor.users.update(
      { _id: userId },
      {
        $unset: {
          'services.twoFactorAuthentication': 1,
        },
      }
    );
  },
  has2faEnabled() {
    return Accounts._is2faEnabledForUser();
  },
});

Accounts.addAutopublishFields({
  forLoggedInUser: ['services.twoFactorAuthentication.type'],
});

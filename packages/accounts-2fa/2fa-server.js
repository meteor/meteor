import { Accounts } from 'meteor/accounts-base';
import twofactor from 'node-2fa';
import QRCode from 'qrcode-svg';
import { Meteor } from 'meteor/meteor';

Accounts._is2faEnabledForUser = selector => {
  if (!Meteor.isServer) {
    throw new Meteor.Error(
      400,
      'The function _is2faEnabledForUser can only be called on the server'
    );
  }

  if (typeof selector === 'string') {
    if (!selector.includes('@')) {
      selector = { username: selector };
    } else {
      selector = { email: selector };
    }
  }

  const user = Meteor.users.findOne(selector) || {};
  const { services: { twoFactorAuthentication } = {} } = user;
  return (
    twoFactorAuthentication &&
    twoFactorAuthentication.secret &&
    twoFactorAuthentication.type === 'otp'
  );
};

Accounts._generate2faToken = secret => twofactor.generateToken(secret);

Accounts._isTokenValid = (secret, code) => {
  if (!Meteor.isServer) {
    throw new Meteor.Error(
      400,
      'The function _isTokenValid can only be called on the server'
    );
  }
  const { delta } = twofactor.verifyToken(secret, code, 10) || {};
  return delta != null && delta >= 0;
};

Meteor.methods({
  generate2faActivationQrCode(appName) {
    const user = Meteor.user();

    if (!user) {
      throw new Meteor.Error(
        400,
        'There must be a user logged in to generate the QR code.'
      );
    }

    const { username } = user;

    const { secret, uri } = twofactor.generateSecret({
      name: appName.trim(),
      account: username,
    });
    const svg = new QRCode(uri).svg();

    Meteor.users.update(
      { username },
      {
        $set: {
          'services.twoFactorAuthentication': {
            secret,
          },
        },
      }
    );

    return svg;
  },
  enableUser2fa(code) {
    const user = Meteor.user();

    if (!user) {
      throw new Meteor.Error(400, 'No user logged in.');
    }

    const {
      services: { twoFactorAuthentication },
      username,
    } = user;

    if (!twoFactorAuthentication || !twoFactorAuthentication.secret) {
      throw new Meteor.Error(
        500,
        'The user does not have a secret generated. You may have to call the function generateSvgCode first.'
      );
    }
    if (!Accounts._isTokenValid(twoFactorAuthentication.secret, code)) {
      throw new Meteor.Error(400, 'Invalid code.');
    }

    Meteor.users.update(
      { username },
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
    const user = Meteor.user();

    if (!user) {
      throw new Meteor.Error(400, 'No user logged in.');
    }

    Meteor.users.update(
      { username: user.username },
      {
        $unset: {
          'services.twoFactorAuthentication': 1,
        },
      }
    );
  },
  has2faEnabled(selector) {
    return Accounts._is2faEnabledForUser(selector);
  },
});

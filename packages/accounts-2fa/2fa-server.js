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

Accounts._is2faEnabledForUser = selector => {
  if (!Meteor.isServer) {
    throw new Meteor.Error(
      400,
      'The function _is2faEnabledForUser can only be called on the server'
    );
  }

  if (typeof selector === 'string') {
    if (!selector.includes('@')) {
      selector = { $or: [{ _id: selector }, { username: selector }] };
    } else {
      selector = { email: selector };
    }
  }

  const user = Meteor.users.findOne(selector) || {};
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
  const { delta } = twofactor.verifyToken(secret, code, 10) || {};
  return delta != null && delta >= 0;
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

    const { secret, uri } = twofactor.generateSecret({
      name: appName.trim(),
      account: user.username || user._id
    });
    const svg = new QRCode(uri).svg();

    Meteor.users.update(
      { _id: user._id },
      {
        $set: {
          'services.twoFactorAuthentication': {
            secret
          }
        }
      }
    );

    return { svg, secret };
  },
  enableUser2fa(code) {
    check(code, String);
    const user = Meteor.user();

    if (!user) {
      throw new Meteor.Error(400, 'No user logged in.');
    }

    const {
      services: { twoFactorAuthentication }
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
      { _id: user._id },
      {
        $set: {
          'services.twoFactorAuthentication': {
            ...twoFactorAuthentication,
            type: 'otp'
          }
        }
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
          'services.twoFactorAuthentication': 1
        }
      }
    );
  },
  has2faEnabled(selector) {
    check(selector, Match.Maybe(Match.OneOf(String, Object)));
    const userId = Meteor.userId();
    if (!userId) {
      throw new Meteor.Error(400, 'No user logged in.');
    }

    if (!selector) {
      selector = { _id: userId };
    }

    return Accounts._is2faEnabledForUser(selector);
  }
});

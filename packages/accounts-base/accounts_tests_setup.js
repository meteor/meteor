import { Accounts } from 'meteor/accounts-base';

import { registerTestLoginHandler, removeTestLoginHandler } from './accounts_login_options_server_tests';

const getTokenFromSecret = async ({ selector, secret: secretParam }) => {
  let secret = secretParam;

  if (!secret) {
    const { services: { twoFactorAuthentication } = {} } =
      await Meteor.users.findOneAsync(selector) || {};
    if (!twoFactorAuthentication) {
      throw new Meteor.Error(500, 'twoFactorAuthentication not set.');
    }
    secret = twoFactorAuthentication.secret;
  }
  const { token } = await Accounts._generate2faToken(secret);

  return token;
};

Meteor.methods({
  async removeAccountsTestUser(username) {
    await Meteor.users.removeAsync({ username });
  },
  async forceEnableUser2fa(selector, secret) {
   await Meteor.users.updateAsync(
      selector,
      {
        $set: {
          'services.twoFactorAuthentication': {
            secret,
            type: 'otp',
          },
        },
      }
    );
    return await getTokenFromSecret({ selector, secret });
  },
  getTokenFromSecret,
  // Helpers for `accounts_login_options_client_tests.js`
  registerTestLoginHandler() {
    registerTestLoginHandler(({ userId }) => ({
      userId,
      options: { foo: 'bar' },
    }));
    // Insert a test user so the client doesn't have to deal with it.
    return Accounts.insertUserDoc({});
  },
  removeTestLoginHandler(userId) {
    removeTestLoginHandler();
    // Remove the test user.
    Meteor.users.remove(userId);
  }
});

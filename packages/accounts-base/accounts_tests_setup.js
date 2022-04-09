const getTokenFromSecret = ({ selector, secret: secretParam }) => {
  let secret = secretParam;

  if (!secret) {
    const { services: { twoFactorAuthentication } = {} } =
      Meteor.users.findOne(selector) || {};
    if (!twoFactorAuthentication) {
      throw new Meteor.Error(500, 'twoFactorAuthentication not set.');
    }
    secret = twoFactorAuthentication.secret;
  }
  const { token } = Accounts._generate2faToken(secret);

  return token;
};

Meteor.methods({
  removeAccountsTestUser(username) {
    Meteor.users.remove({ username });
  },
  forceEnableUser2fa(selector, secret) {
    Meteor.users.update(
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
    return getTokenFromSecret({ selector, secret });
  },
  getTokenFromSecret,
});

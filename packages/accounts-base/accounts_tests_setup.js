const getTokenFromSecret = ({ username, secret: secretParam }) => {
  let secret = secretParam;

  if (!secret) {
    const { twoFactorAuthentication } =
      Meteor.users.findOne({ username }) || {};
    if (!twoFactorAuthentication) {
      throw new Meteor.Error(500, 'twoFactorAuthentication not set.');
    }
    secret = twoFactorAuthentication.secret;
  }
  const { token } = Accounts.generate2faToken(secret);

  return token;
};

Meteor.methods({
  removeAccountsTestUser(username) {
    Meteor.users.remove({ username });
  },
  forceEnableUser2fa(username, secret) {
    Meteor.users.update(
      { username },
      {
        $set: {
          twoFactorAuthentication: {
            secret,
            type: 'otp',
          },
        },
      }
    );
    return getTokenFromSecret({ username, secret });
  },
  getTokenFromSecret,
});

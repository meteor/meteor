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

Accounts.config({ ambiguousErrorMessages: false });

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
  async getLoginTokenCount(userId) {
    const user = await Meteor.users.findOneAsync(userId);
    return user?.services?.resume?.loginTokens?.length ?? 0;
  },
  async pushFakeLoginToken(userId, hashedToken) {
    await Meteor.users.updateAsync(userId, {
      $push: {
        'services.resume.loginTokens': {
          hashedToken,
          when: new Date(),
        },
      },
    });
  },
});

import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';

Meteor.methods({
  async '_e2e.createUser'(opts) {
    check(opts, {
      username: Match.Optional(String),
      email: Match.Optional(String),
      password: Match.Optional(String),
      verified: Match.Optional(Boolean),
      profile: Match.Optional(Object),
    });
    const createOptions = {};
    if (opts.username) createOptions.username = opts.username;
    if (opts.email) createOptions.email = opts.email;
    if (opts.password) createOptions.password = opts.password;
    if (opts.profile) createOptions.profile = opts.profile;
    const userId = await Accounts.createUserAsync(createOptions);
    if (opts.verified && opts.email) {
      await Meteor.users.updateAsync(
        { _id: userId, 'emails.address': opts.email },
        { $set: { 'emails.$.verified': true } },
      );
    }
    return userId;
  },

  async '_e2e.getUser'(userId) {
    check(userId, String);
    return Meteor.users.findOneAsync({ _id: userId });
  },

  async '_e2e.findUserByEmail'(email) {
    check(email, String);
    return Meteor.users.findOneAsync({ 'emails.address': email });
  },

  async '_e2e.setPassword'({ userId, newPassword, logout }) {
    check(userId, String);
    check(newPassword, String);
    check(logout, Match.Optional(Boolean));
    return Accounts.setPasswordAsync(userId, newPassword, { logout: !!logout });
  },

  async '_e2e.invalidateAllLoginTokens'(userId) {
    check(userId, String);
    await Meteor.users.updateAsync(
      { _id: userId },
      { $set: { 'services.resume.loginTokens': [] } },
    );
    return true;
  },

  async '_e2e.expireLoginTokens'(userId) {
    check(userId, String);
    const user = await Meteor.users.findOneAsync({ _id: userId });
    const tokens = user?.services?.resume?.loginTokens || [];
    const longAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365);
    await Meteor.users.updateAsync(
      { _id: userId },
      { $set: { 'services.resume.loginTokens': tokens.map((t) => ({ ...t, when: longAgo })) } },
    );
    return true;
  },

  async '_e2e.whoAmI'() {
    return { userId: this.userId };
  },
});

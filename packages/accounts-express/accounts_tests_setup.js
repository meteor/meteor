Meteor.methods({
  async removeAccountsExpressTestUser(username) {
    if (typeof username !== 'string' || !username) {
      throw new Meteor.Error(
        'bad-username',
        'username must be a non-empty string'
      );
    }
    await Meteor.users.removeAsync({ username });
  },
});

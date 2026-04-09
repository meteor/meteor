Meteor.methods({
  async removeAccountsExpressTestUser(username) {
    await Meteor.users.removeAsync({ username });
  },
});

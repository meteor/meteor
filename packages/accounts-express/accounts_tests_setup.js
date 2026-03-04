Meteor.methods({
  async removeAccountsTestUser(username) {
    await Meteor.users.removeAsync({ username });
  },
});

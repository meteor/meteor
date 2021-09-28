Meteor.methods({
  removeAccountsTestUser(username) {
    Meteor.users.remove({ username });
  },
});

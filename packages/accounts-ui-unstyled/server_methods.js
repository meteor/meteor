Meteor.methods({
  accountsLoggedIn: function () {
    // Fire the loggedIn event
    if (Accounts.loggedIn !== undefined) Accounts.loggedIn();
  },
  accountsLoggedOut: function () {
    // Fire the loggedOut event
    if (Accounts.loggedOut !== undefined) Accounts.loggedOut();
  }
});
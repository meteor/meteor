Meteor.methods({
  accountsOnLoggedIn: function () {
    // Fire the loggedIn event
    if (Accounts.onLoggedIn !== undefined) Accounts.onLoggedIn();
  },
  accountsOnLoggedOut: function () {
    // Fire the loggedOut event
    if (Accounts.onLoggedOut !== undefined) Accounts.onLoggedOut();
  }
});
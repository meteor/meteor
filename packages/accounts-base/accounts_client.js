(function () {

  Meteor.user = function () {
    var userId = Meteor.default_connection.userId();
    if (userId) {
      var result = Meteor.users.findOne(userId);
      if (result) {
        return result;
      } else {
        // If the login method completes but new subcriptions haven't
        // yet been sent down to the client, this is the best we can
        // do
        return {_id: userId, loading: true};
      }
    } else {
      return null;
    }
  };

  Meteor.logout = function (callback) {
    Meteor.apply('logout', [], {wait: true}, function(error, result) {
      if (error) {
        callback && callback(error);
      } else {
        Meteor.accounts.makeClientLoggedOut();
        callback && callback();
      }
    });
  };

  // If we're using Handlebars, register the {{currentUser}} global
  // helper
  if (window.Handlebars) {
    Handlebars.registerHelper('currentUser', function () {
      return Meteor.user();
    });
  }

  // manage a session variable that specifies whether all of the configuration
  // documents in mongo have been loaded
  var ACCOUNTS_CONFIGURED_KEY = "Meteor.accounts.configured";

  Meteor.subscribe("Meteor.accounts.configuration", function () {
    Session.set(ACCOUNTS_CONFIGURED_KEY, true);
  });

  // used by accounts-ui to hide the login button until we have all
  // the configuration loaded
  Meteor.accounts.configured = function () {
    return Session.get(ACCOUNTS_CONFIGURED_KEY);
  };
})();

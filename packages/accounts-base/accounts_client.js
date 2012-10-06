(function () {

  Meteor.userId = function () {
    return Meteor.default_connection.userId();
  };

  Meteor.user = function () {
    var userId = Meteor.userId();
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
        Accounts._makeClientLoggedOut();
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

  // XXX this can be simplified if we merge in
  // https://github.com/meteor/meteor/pull/273
  var loginServicesConfigured = false;
  var loginServicesConfiguredListeners = new Meteor.deps._ContextSet;
  Meteor.subscribe("loginServiceConfiguration", function () {
    loginServicesConfigured = true;
    loginServicesConfiguredListeners.invalidateAll();
  });

  // A reactive function returning whether the
  // loginServiceConfiguration subscription is ready. Used by
  // accounts-ui to hide the login button until we have all the
  // configuration loaded
  Accounts.loginServicesConfigured = function () {
    if (loginServicesConfigured)
      return true;

    // not yet complete, save the context for invalidation once we are.
    loginServicesConfiguredListeners.addCurrentContext();
    return false;
  };
})();

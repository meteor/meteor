(function () {

  Meteor.userId = function () {
    return Meteor.default_connection.userId();
  };

  var userLoadedListeners = new Meteor.deps._ContextSet;
  var currentUserSubscriptionData;

  Meteor.userLoaded = function () {
    userLoadedListeners.addCurrentContext();
    return currentUserSubscriptionData && currentUserSubscriptionData.loaded;
  };

  // This calls userId and userLoaded, both of which are reactive.
  Meteor.user = function () {
    var userId = Meteor.userId();
    if (!userId)
      return null;
    if (Meteor.userLoaded()) {
      var user = Meteor.users.findOne(userId);
      if (user) return user;
    }
    // Either the subscription isn't done yet, or for some reason this user has
    // no published fields (and thus is considered to not exist in
    // minimongo). Return a minimal object.
    return {_id: userId};
  };

  Accounts._makeClientLoggedOut = function() {
    Accounts._unstoreLoginToken();
    Meteor.default_connection.setUserId(null);
    Meteor.default_connection.onReconnect = null;
    userLoadedListeners.invalidateAll();
    if (currentUserSubscriptionData) {
      currentUserSubscriptionData.handle.stop();
      currentUserSubscriptionData = null;
    }
  };

  Accounts._makeClientLoggedIn = function(userId, token) {
    Accounts._storeLoginToken(userId, token);
    Meteor.default_connection.setUserId(userId);
    Meteor.default_connection.onReconnect = function() {
      Meteor.apply('login', [{resume: token}], {wait: true}, function(error, result) {
        if (error) {
          Accounts._makeClientLoggedOut();
          throw error;
        } else {
          // nothing to do
        }
      });
    };
    userLoadedListeners.invalidateAll();
    if (currentUserSubscriptionData) {
      currentUserSubscriptionData.handle.stop();
    }
    var data = currentUserSubscriptionData = {loaded: false};
    data.handle = Meteor.subscribe(
      "meteor.currentUser", function () {
        // Important! We use "data" here, not "currentUserSubscriptionData", so
        // that if we log out and in again before this subscription is ready, we
        // don't make currentUserSubscriptionData look ready just because this
        // older iteration of subscribing is ready.
        data.loaded = true;
        userLoadedListeners.invalidateAll();
      });
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

  // If we're using Handlebars, register the {{currentUser}} and
  // {{currentUserLoaded}} global helpers.
  if (typeof Handlebars !== 'undefined') {
    Handlebars.registerHelper('currentUser', function () {
      return Meteor.user();
    });
    Handlebars.registerHelper('currentUserLoaded', function () {
      return Meteor.userLoaded();
    });
  }

  // XXX this can be simplified if we merge in
  // https://github.com/meteor/meteor/pull/273
  var loginServicesConfigured = false;
  var loginServicesConfiguredListeners = new Meteor.deps._ContextSet;
  Meteor.subscribe("meteor.loginServiceConfiguration", function () {
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

(function () {
  Meteor.user = function () {
    if (Meteor.default_connection.userId()) {
      // XXX full identity?
      return {_id: Meteor.default_connection.userId()};
    } else {
      return null;
    }
  };

  if (Handlebars) {
    Handlebars.registerHelper('user', function () {
      return Meteor.user();
    });
  }

  Meteor.logout = function () {
    Meteor.apply('logout', [], {wait: true}, function(error, result) {
      if (error)
        throw error;
      else
        Meteor.accounts.forceClientLoggedOut();
    });
  };
})();

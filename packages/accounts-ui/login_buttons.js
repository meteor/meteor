(function () {

  Template.loginButtons.events = {
    'click #login-buttons-Facebook': function () {
      try {
        Meteor.loginWithFacebook();
      } catch (e) {
        if (e instanceof Meteor.accounts.ConfigError)
          alert("Facebook API key not set. Configure app details with "
                + "Meteor.accounts.facebook.config() "
                + "and Meteor.accounts.facebook.setSecret()");
        else
          throw e;
      }
    },

    'click #login-buttons-Google': function () {
      try {
        Meteor.loginWithGoogle();
      } catch (e) {
        if (e instanceof Meteor.accounts.ConfigError)
          alert("Google API key not set. Configure app details with "
                + "Meteor.accounts.google.config() and "
                + "Meteor.accounts.google.setSecret()");
        else
          throw e;
      };
    },

    'click #login-buttons-Weibo': function () {
      try {
        Meteor.loginWithWeibo();
      } catch (e) {
        if (e instanceof Meteor.accounts.ConfigError)
          alert("Weibo API key not set. Configure app details with "
                + "Meteor.accounts.weibo.config() and "
                + "Meteor.accounts.weibo.setSecret()");
        else
          throw e;
      };
    },

    'click #login-buttons-logout': function() {
      Meteor.logout();
    }
  };

  Template.loginButtons.services = function () {
    var ret = [];
    // XXX It would be nice if there were an automated way to read the
    // list of services, such as _.each(Meteor.accounts.services, ...)
    if (Meteor.accounts.facebook)
      ret.push({name: 'Facebook'});
    if (Meteor.accounts.google)
      ret.push({name: 'Google'});
    if (Meteor.accounts.weibo)
      ret.push({name: 'Weibo'});

    return ret;
  };

})();

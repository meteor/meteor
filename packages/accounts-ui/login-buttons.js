(function () {

  Template.loginButtons.events = {
    'click #login-buttons-Facebook': function () {
      try {
        Meteor.loginWithFacebook();
      } catch (e) {
        if (e instanceof Meteor.accounts.ConfigError)
          alert("Facebook API key not set. Configure app details with Meteor.accounts.facebook.config()");
        else
          throw e;
      }
    },

    'click #login-buttons-Google': function () {
      try {
        Meteor.loginWithGoogle();
      } catch (e) {
        if (e instanceof Meteor.accounts.ConfigError)
          alert("Google API key not set. Configure app details with Meteor.accounts.google.config()");
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
    if (Meteor.accounts.facebook)
      ret.push({name: 'Facebook'});
    if (Meteor.accounts.google)
      ret.push({name: 'Google'});

    return ret;
  };

  Template.loginButtons.userEmail = function () {
    var user = Meteor.user();
    if (!user || !user.emails || !user.emails[0])
      return '';
    return user.emails[0];
  };

  Template.loginButtons.userName = function () {
    var user = Meteor.user();
    if (!user || !user.name)
      return '';
    return user.name;
  };


})();

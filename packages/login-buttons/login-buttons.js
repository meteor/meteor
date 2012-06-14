(function () {

  Template.login_buttons.events = {
    'click #login-buttons-Facebook': function () {
      try {
        Meteor.loginWithFacebook();
      } catch (e) {
        if (e instanceof Meteor.accounts.facebook.SetupError)
          alert("You haven't set up your Facebook app details. See fb-app.js and server/fb-secret.js");
        else
          throw e;
      }
    },

    'click #login-buttons-Google': function () {
      try {
        Meteor.loginWithGoogle();
      } catch (e) {
        if (e instanceof Meteor.accounts.google.SetupError)
          alert("You haven't set up your Google API details. See google-api.js and server/google-secret.js");
        else
          throw e;
      };
    },

    'click #login-buttons-logout': function() {
      Meteor.logout();
    }
  };

  Template.login_buttons.services = function () {
    var ret = [];
    if (Meteor.accounts.facebook)
      ret.push({name: 'Facebook'});
    if (Meteor.accounts.google)
      ret.push({name: 'Google'});

    return ret;
  };

  Template.login_buttons.userEmail = function () {
    var user = Meteor.user();
    if (!user || !user.emails || !user.emails[0])
      return '';
    return user.emails[0];
  };

  Template.login_buttons.userName = function () {
    var user = Meteor.user();
    if (!user || !user.name)
      return '';
    return user.name;
  };


})();

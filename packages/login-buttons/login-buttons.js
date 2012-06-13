(function () {

  Template.login_buttons.events = {
    'click #login-buttons-fb-login': function () {
      try {
        Meteor.loginWithFacebook();
      } catch (e) {
        if (e instanceof Meteor.accounts.facebook.SetupError)
          alert("You haven't set up your Facebook app details. See fb-app.js and server/fb-secret.js");
        else
          throw e;
      }
    },

    'click #login-buttons-google-login': function () {
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

})();

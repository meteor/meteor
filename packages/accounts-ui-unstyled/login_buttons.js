(function () {
  if (!Accounts._loginButtons)
    Accounts._loginButtons = {};

  // for convenience
  var loginButtonsSession = Accounts._loginButtonsSession;

  // shared between dropdown and single mode
  Template.loginButtons.events({
    'click #login-buttons-logout': function() {
      Meteor.logout(function () {
        loginButtonsSession.closeDropdown();
      });
    }
  });


  //
  // loginButtonLoggedOut template
  //

  Template.loginButtonsLoggedOut.dropdown = function () {
    return Accounts._loginButtons.dropdown();
  };

  Template.loginButtonsLoggedOut.services = function () {
    return Accounts._loginButtons.getLoginServices();
  };

  Template.loginButtonsLoggedOut.singleService = function () {
    var services = Accounts._loginButtons.getLoginServices();
    if (services.length !== 1)
      throw new Error(
        "Shouldn't be rendering this template with more than one configured service");
    return services[0];
  };

  Template.loginButtonsLoggedOut.configurationLoaded = function () {
    return Accounts.loginServicesConfigured();
  };


  //
  // loginButtonsLoggedIn template
  //

  // decide whether we should show a dropdown rather than a row of
  // buttons
  Template.loginButtonsLoggedIn.dropdown = function () {
    return Accounts._loginButtons.dropdown();
  };

  Template.loginButtonsLoggedIn.displayName = function () {
    return Accounts._loginButtons.displayName();
  };



  //
  // loginButtonsMessage template
  //

  Template.loginButtonsMessages.errorMessage = function () {
    return loginButtonsSession.get('errorMessage');
  };

  Template.loginButtonsMessages.infoMessage = function () {
    return loginButtonsSession.get('infoMessage');
  };


  //
  // helpers
  //

  Accounts._loginButtons.displayName = function () {
    var user = Meteor.user();
    if (!user)
      return '';

    if (user.profile && user.profile.name)
      return user.profile.name;
    if (user.username)
      return user.username;
    if (user.emails && user.emails[0] && user.emails[0].address)
      return user.emails[0].address;

    return '';
  };

  Accounts._loginButtons.getLoginServices = function () {
    var ret = [];
    // make sure to put password last, since this is how it is styled
    // in the ui as well.
    _.each(
      ['facebook', 'google', 'weibo', 'twitter', 'github', 'password'],
      function (service) {
        if (Accounts[service])
          ret.push({name: service});
      });

    return ret;
  };

  Accounts._loginButtons.hasPasswordService = function () {
    return Accounts.password;
  };

  Accounts._loginButtons.dropdown = function () {
    return Accounts._loginButtons.hasPasswordService() || Accounts._loginButtons.getLoginServices().length > 1;
  };

  // XXX improve these. should this be in accounts-password instead?
  //
  // XXX these will become configurable, and will be validated on
  // the server as well.
  Accounts._loginButtons.validateUsername = function (username) {
    if (username.length >= 3) {
      return true;
    } else {
      loginButtonsSession.set('errorMessage', "Username must be at least 3 characters long");
      return false;
    }
  };
  Accounts._loginButtons.validateEmail = function (email) {
    if (email.indexOf('@') !== -1) {
      return true;
    } else {
      loginButtonsSession.set('errorMessage', "Invalid email");
      return false;
    }
  };
  Accounts._loginButtons.validatePassword = function (password) {
    if (password.length >= 6) {
      return true;
    } else {
      loginButtonsSession.set('errorMessage', "Password must be at least 6 characters long");
      return false;
    }
  };

})();


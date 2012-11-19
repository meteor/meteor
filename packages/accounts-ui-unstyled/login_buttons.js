(function () {
  if (!Accounts._loginButtons)
    Accounts._loginButtons = {};

  // for convenience
  var loginButtonsSession = Accounts._loginButtonsSession;

  Handlebars.registerHelper(
    "loginButtons",
    function (options) {
      if (options.hash.align === "right")
        return new Handlebars.SafeString(Template._loginButtons({align: "right"}));
      else
        return new Handlebars.SafeString(Template._loginButtons({align: "left"}));
    });

  // shared between dropdown and single mode
  Template._loginButtons.events({
    'click #login-buttons-logout': function() {
      Meteor.logout(function () {
        loginButtonsSession.closeDropdown();
      });
    }
  });

  Template._loginButtons.preserve({
    'input[id]': Spark._labelFromIdOrName
  });

  //
  // loginButtonLoggedOut template
  //

  Template._loginButtonsLoggedOut.dropdown = function () {
    return Accounts._loginButtons.dropdown();
  };

  Template._loginButtonsLoggedOut.services = function () {
    return Accounts._loginButtons.getLoginServices();
  };

  Template._loginButtonsLoggedOut.singleService = function () {
    var services = Accounts._loginButtons.getLoginServices();
    if (services.length !== 1)
      throw new Error(
        "Shouldn't be rendering this template with more than one configured service");
    return services[0];
  };

  Template._loginButtonsLoggedOut.configurationLoaded = function () {
    return Accounts.loginServicesConfigured();
  };


  //
  // loginButtonsLoggedIn template
  //

  // decide whether we should show a dropdown rather than a row of
  // buttons
  Template._loginButtonsLoggedIn.dropdown = function () {
    return Accounts._loginButtons.dropdown();
  };



  //
  // loginButtonsLoggedInSingleLogoutButton template
  //

  Template._loginButtonsLoggedInSingleLogoutButton.displayName = function () {
    return Accounts._loginButtons.displayName();
  };



  //
  // loginButtonsMessage template
  //

  Template._loginButtonsMessages.errorMessage = function () {
    return loginButtonsSession.get('errorMessage');
  };

  Template._loginButtonsMessages.infoMessage = function () {
    return loginButtonsSession.get('infoMessage');
  };


  //
  // loginButtonsLoggingInPadding template
  //

  Template._loginButtonsLoggingInPadding.dropdown = function () {
    return Accounts._loginButtons.dropdown();
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
      ['facebook', 'github', 'google', 'twitter', 'weibo', 'password'],
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
      loginButtonsSession.errorMessage("Username must be at least 3 characters long");
      return false;
    }
  };
  Accounts._loginButtons.validateEmail = function (email) {
    if (Accounts.ui._passwordSignupFields() === "USERNAME_AND_OPTIONAL_EMAIL" && email === '')
      return true;

    if (email.indexOf('@') !== -1) {
      return true;
    } else {
      loginButtonsSession.errorMessage("Invalid email");
      return false;
    }
  };
  Accounts._loginButtons.validatePassword = function (password) {
    if (password.length >= 6) {
      return true;
    } else {
      loginButtonsSession.errorMessage("Password must be at least 6 characters long");
      return false;
    }
  };

})();

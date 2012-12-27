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

  // returns an array of the login services used by this app. each
  // element of the array is an object (eg {name: 'facebook'}), since
  // that makes it useful in combination with handlebars {{#each}}.
  //
  // NOTE: It is very important to have this return password last
  // because of the way we render the different providers in
  // login_buttons_dropdown.html
  Accounts._loginButtons.getLoginServices = function () {
    var self = this;
    var services = [];

    // find all methods of the form: `Meteor.loginWithFoo`, where
    // `Foo` corresponds to a login service
    //
    // XXX we should consider having a client-side
    // Accounts.oauth.registerService function which records the
    // active services and encapsulates boilerplate code now found in
    // files such as facebook_client.js. This would have the added
    // benefit of allow us to unify facebook_{client,common,server}.js
    // into one file, which would encourage people to build more login
    // services packages.
    _.each(_.keys(Meteor), function(methodName) {
      var match;
      if ((match = methodName.match(/^loginWith(.*)/))) {
        var serviceName = match[1].toLowerCase();

        // HACKETY HACK. needed to not match
        // Meteor.loginWithToken. See XXX above.
        if (Accounts[serviceName])
          services.push(match[1].toLowerCase());
      }
    });

    // Be equally kind to all login services. This also preserves
    // backwards-compatibility. (But maybe order should be
    // configurable?)
    services.sort();

    // ensure password is last
    if (_.contains(services, 'password'))
      services = _.without(services, 'password').concat(['password']);

    return _.map(services, function(name) {
      return {name: name};
    });
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

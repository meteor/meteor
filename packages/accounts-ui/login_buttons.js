(function () {
  //
  // Session
  //

  var DROPDOWN_VISIBLE_KEY = 'Meteor.loginButtons.dropdownVisible';
  var IN_SIGNUP_FLOW_KEY = 'Meteor.loginButtons.inSignupFlow';
  var IN_FORGOT_PASSWORD_FLOW_KEY = 'Meteor.loginButtons.inForgotPasswordFlow';
  var ERROR_MESSAGE_KEY = 'Meteor.loginButtons.errorMessage';
  var INFO_MESSAGE_KEY = 'Meteor.loginButtons.infoMessage';
  var RESET_PASSWORD_TOKEN_KEY = 'Meteor.loginButtons.resetPasswordToken';

  var resetSession = function () {
    Session.set(IN_SIGNUP_FLOW_KEY, false);
    Session.set(IN_FORGOT_PASSWORD_FLOW_KEY, false);
    Session.set(DROPDOWN_VISIBLE_KEY, false);
    resetMessages();
  };

  var resetMessages = function () {
    Session.set(ERROR_MESSAGE_KEY, null);
    Session.set(INFO_MESSAGE_KEY, null);
  };


  //
  // loginButtons template
  //

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
      resetSession();
    }
  };

  // decide whether we should show a dropdown rather than a row of
  // buttons
  Template.loginButtons.dropdown = function () {
    var services = getLoginServices();

    var hasPasswordService = _.any(services, function (service) {
      return service.name === 'Password';
    });

    return hasPasswordService || services.length > 2;
  };

  Template.loginButtons.services = function () {
    return getLoginServices();
  };

  //
  // loginButtonsServiceRow template
  //

  Template.loginButtonsServicesRow.events = {
    'click #login-buttons-password': function () {
      loginOrSignup();
    },
    'click #signup-link': function () {
      resetMessages();
      Session.set(IN_SIGNUP_FLOW_KEY, true);
      Session.set(IN_FORGOT_PASSWORD_FLOW_KEY, false);
    },
    'click #forgot-password-link': function () {
      resetMessages();
      Session.set(IN_SIGNUP_FLOW_KEY, false);
      Session.set(IN_FORGOT_PASSWORD_FLOW_KEY, true);
    },
    'keypress #login-username,#login-password,#login-password-again': function (event) {
      if (event.keyCode === 13)
        loginOrSignup();
    }
  };

  Template.loginButtonsServicesRow.services = function () {
    return getLoginServices();
  };

  Template.loginButtonsServicesRow.isPasswordService = function () {
    return this.name === 'Password';
  };

  Template.loginButtonsServicesRow.hasOtherServices = function () {
    return getLoginServices().length > 1;
  };

  Template.loginButtonsServicesRow.isForgotPasswordFlow = function () {
    return Session.get(IN_FORGOT_PASSWORD_FLOW_KEY);
  };

  //
  // loginButtonsMessage template
  //

  Template.loginButtonsMessages.errorMessage = function () {
    return Session.get(ERROR_MESSAGE_KEY);
  };

  Template.loginButtonsMessages.infoMessage = function () {
    return Session.get(INFO_MESSAGE_KEY);
  };


  //
  // loginButtonsServicesRowDynamicPart template
  //

  Template.loginButtonsServicesRowDynamicPart.inLoginFlow = function () {
    return !Session.get(IN_SIGNUP_FLOW_KEY) && !Session.get(IN_FORGOT_PASSWORD_FLOW_KEY);
  };

  Template.loginButtonsServicesRowDynamicPart.inSignupFlow = function () {
    return Session.get(IN_SIGNUP_FLOW_KEY);
  };


  //
  // forgotPasswordForm template
  //
  Template.forgotPasswordForm.events = {
    'keypress #forgot-password-email': function (event) {
      if (event.keyCode === 13)
        forgotPassword();
    },
    'click #login-buttons-forgot-password': function () {
      forgotPassword();
    }
  };

  var forgotPassword = function () {
    resetMessages();

    var email = document.getElementById("forgot-password-email").value;
    if (email.indexOf('@') !== -1) {
      Meteor.forgotPassword({email: email}, function (error) {
        if (error)
          Session.set(ERROR_MESSAGE_KEY, error.reason);
        else
          Session.set(INFO_MESSAGE_KEY, "Email sent");
      });
    } else {
      Session.set(ERROR_MESSAGE_KEY, "Invalid email");
    }
  };


  //
  // loginButtonsServicesDropdown template
  //

  Template.loginButtonsServicesDropdown.events = {
    'click .login-link-text': function () {
      Session.set(DROPDOWN_VISIBLE_KEY, true);
      // IE <= 7 has a z-index bug that means we can't just give the
      // dropdown a z-index and expect it to stack above the rest of
      // the page even if nothing else has a z-index.  The nature of
      // the bug is that all positioned elements are considered to
      // have z-index:0 (not auto) and therefore start new stacking
      // contexts, with ties broken by page order.
      //
      // The fix, then is to give z-index:1 to all ancestors
      // of the dropdown having z-index:0.
      Meteor.flush();
      for(var n = document.getElementById('login-dropdown-list').parentNode;
          n.nodeName !== 'BODY';
          n = n.parentNode)
        if (n.style.zIndex === 0)
          n.style.zIndex = 1;
    },
    'click .login-close-text': function () {
      resetSession();
    }
  };

  Template.loginButtonsServicesDropdown.dropdownVisible = function () {
    return Session.get(DROPDOWN_VISIBLE_KEY);
  };


  //
  // resetPasswordForm template
  //

  Template.resetPasswordForm.events = {
    'click #reset-password-button': function () {
      resetPassword();
    },
    'keypress #reset-password-new-password': function (event) {
      if (event.keyCode === 13)
        resetPassword();
    }
  };

  var resetPassword = function () {
    resetMessages();
    var newPassword = document.getElementById('reset-password-new-password').value;
    if (!validatePassword(newPassword))
      return;

    Meteor.resetPassword(
      Session.get(RESET_PASSWORD_TOKEN_KEY), newPassword,
      function (error) {
        if (error) {
          Session.set(ERROR_MESSAGE_KEY, error.reason);
        } else {
          Session.set(RESET_PASSWORD_TOKEN_KEY, null);
          Meteor.accounts._preventAutoLogin = false;
        }
      });
  };

  Template.resetPasswordForm.inResetPasswordFlow = function () {
    return Session.get(RESET_PASSWORD_TOKEN_KEY);
  };

  if (Meteor.accounts._resetPasswordToken) {
    Session.set(RESET_PASSWORD_TOKEN_KEY, Meteor.accounts._resetPasswordToken);
  }


  //
  // helpers
  //

  var login = function () {
    resetMessages();
    var username = document.getElementById('login-username').value;
    var password = document.getElementById('login-password').value;

    Meteor.loginWithPassword(username, password, function (error, result) {
      if (error) {
        Session.set(ERROR_MESSAGE_KEY, error.reason);
      }
    });
  };

  var signup = function () {
    resetMessages();
    var username = document.getElementById('login-username').value;
    var password = document.getElementById('login-password').value;
    var passwordAgain = document.getElementById('login-password-again').value;

    // XXX these will become configurable, and will be validated on
    // the server as well.
    if (!validateUsername(username) || !validatePassword(password))
      return;

    if (password !== passwordAgain) {
      Session.set(ERROR_MESSAGE_KEY, "Passwords don't match");
      return;
    }

    Meteor.createUser({username: username, password: password}, function (error) {
      if (error) {
        Session.set(ERROR_MESSAGE_KEY, error.reason);
      }
    });
  };

  var loginOrSignup = function () {
    if (Session.get(IN_SIGNUP_FLOW_KEY))
      signup();
    else
      login();
  };

  var getLoginServices = function () {
    var ret = [];
    // XXX It would be nice if there were an automated way to read the
    // list of services, such as _.each(Meteor.accounts.services, ...)
    if (Meteor.accounts.facebook)
      ret.push({name: 'Facebook'});
    if (Meteor.accounts.google)
      ret.push({name: 'Google'});
    if (Meteor.accounts.weibo)
      ret.push({name: 'Weibo'});

    // make sure to put accounts last, since this is the order in the
    // ui as well
    if (Meteor.accounts.passwords)
      ret.push({name: 'Password'});

    return ret;
  };


  // XXX improve these? should this be in accounts-passwords instead?
  var validateUsername = function (username) {
    if (username.length >= 3) {
      return true;
    } else {
      Session.set(ERROR_MESSAGE_KEY, "Username must be at least 3 characters long");
      return false;
    }
  };
  var validatePassword = function (password) {
    if (password.length >= 6) {
      return true;
    } else {
      Session.set(ERROR_MESSAGE_KEY, "Password must be at least 6 characters long");
      return false;
    }
  };
})();


(function () {
  //
  // Session
  //

  var DROPDOWN_VISIBLE_KEY = 'Meteor.loginButtons.dropdownVisible';
  var IN_SIGNUP_FLOW_KEY = 'Meteor.loginButtons.inSignupFlow';
  var ERROR_MESSAGE_KEY = 'Meteor.loginButtons.errorMessage';

  var resetSession = function () {
    Session.set(IN_SIGNUP_FLOW_KEY, false);
    Session.set(DROPDOWN_VISIBLE_KEY, false);
    Session.set(ERROR_MESSAGE_KEY, null);
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
      Session.set(ERROR_MESSAGE_KEY, null);
      Session.set(IN_SIGNUP_FLOW_KEY, true);
    },
    'keypress #login-username,#login-password,#login-password-again': function (event) {
      if (event.keyCode === 13)
        loginOrSignup();
    },
    'keypress #login-password-again': function (event) {
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


  //
  // loginButtonsServicesRowDynamicPart template
  //

  Template.loginButtonsServicesRowDynamicPart.errorMessage = function () {
    return Session.get(ERROR_MESSAGE_KEY);
  };

  Template.loginButtonsServicesRowDynamicPart.inSignupFlow = function () {
    return Session.get(IN_SIGNUP_FLOW_KEY);
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
  // helpers
  //

  var login = function () {
    var username = document.getElementById('login-username').value;
    var password = document.getElementById('login-password').value;

    Meteor.loginWithPassword(username, password, function (error, result) {
      if (error) {
        Session.set(ERROR_MESSAGE_KEY, error.reason);
      }
    });
  };

  var signup = function () {
    var username = document.getElementById('login-username').value;
    var password = document.getElementById('login-password').value;
    var passwordAgain = document.getElementById('login-password-again').value;

    // XXX these will become configurable, and will be validated on
    // the server as well.
    if (username.length < 3) {
      Session.set(ERROR_MESSAGE_KEY, "Username must be at least 3 characters long");
    } else if (password.length < 6) {
      Session.set(ERROR_MESSAGE_KEY, "Password must be at least 6 characters long");
    } else if (password !== passwordAgain) {
      Session.set(ERROR_MESSAGE_KEY, "Passwords don't match");
    } else {
      Meteor.createUser({username: username, password: password}, function (error) {
        if (error) {
          Session.set(ERROR_MESSAGE_KEY, error.reason);
        }
      });
    }
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
})();

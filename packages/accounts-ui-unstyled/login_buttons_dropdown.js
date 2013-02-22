(function () {
  // for convenience
  var loginButtonsSession = Accounts._loginButtonsSession;

  // events shared between loginButtonsLoggedOutDropdown and
  // loginButtonsLoggedInDropdown
  Template._loginButtons.events({
    'click #login-name-link, click #login-sign-in-link': function () {
      loginButtonsSession.set('dropdownVisible', true);
      Meteor.flush();
      correctDropdownZIndexes();
    },
    'click .login-close-text': function () {
      loginButtonsSession.closeDropdown();
    }
  });


  //
  // loginButtonsLoggedInDropdown template and related
  //

  Template._loginButtonsLoggedInDropdown.events({
    'click #login-buttons-open-change-password': function() {
      loginButtonsSession.resetMessages();
      loginButtonsSession.set('inChangePasswordFlow', true);
    }
  });

  Template._loginButtonsLoggedInDropdown.displayName = function () {
    return Accounts._loginButtons.displayName();
  };

  Template._loginButtonsLoggedInDropdown.inChangePasswordFlow = function () {
    return loginButtonsSession.get('inChangePasswordFlow');
  };

  Template._loginButtonsLoggedInDropdown.inMessageOnlyFlow = function () {
    return loginButtonsSession.get('inMessageOnlyFlow');
  };

  Template._loginButtonsLoggedInDropdown.dropdownVisible = function () {
    return loginButtonsSession.get('dropdownVisible');
  };

  Template._loginButtonsLoggedInDropdownActions.allowChangingPassword = function () {
    // it would be more correct to check whether the user has a password set,
    // but in order to do that we'd have to send more data down to the client,
    // and it'd be preferable not to send down the entire service.password document.
    //
    // instead we use the heuristic: if the user has a username or email set.
    var user = Meteor.user();
    return user.username || (user.emails && user.emails[0] && user.emails[0].address);
  };


  //
  // loginButtonsLoggedOutDropdown template and related
  //

  Template._loginButtonsLoggedOutDropdown.events({
    'click #login-buttons-password': function () {
      loginOrSignup();
    },

    'keypress #forgot-password-email': function (event) {
      if (event.keyCode === 13)
        forgotPassword();
    },

    'click #login-buttons-forgot-password': function () {
      forgotPassword();
    },

    'click #signup-link': function () {
      loginButtonsSession.resetMessages();

      // store values of fields before swtiching to the signup form
      var username = trimmedElementValueById('login-username');
      var email = trimmedElementValueById('login-email');
      var usernameOrEmail = trimmedElementValueById('login-username-or-email');
      // notably not trimmed. a password could (?) start or end with a space
      var password = elementValueById('login-password');

      loginButtonsSession.set('inSignupFlow', true);
      loginButtonsSession.set('inForgotPasswordFlow', false);
      // force the ui to update so that we have the approprate fields to fill in
      Meteor.flush();

      // update new fields with appropriate defaults
      if (username !== null)
        document.getElementById('login-username').value = username;
      else if (email !== null)
        document.getElementById('login-email').value = email;
      else if (usernameOrEmail !== null)
        if (usernameOrEmail.indexOf('@') === -1)
          document.getElementById('login-username').value = usernameOrEmail;
      else
        document.getElementById('login-email').value = usernameOrEmail;
      // "login-password" is preserved, since password fields aren't updated by Spark.

      // Force redrawing the `login-dropdown-list` element because of
      // a bizarre Chrome bug in which part of the DIV is not redrawn
      // in case you had tried to unsuccessfully log in before
      // switching to the signup form.
      //
      // Found tip on how to force a redraw on
      // http://stackoverflow.com/questions/3485365/how-can-i-force-webkit-to-redraw-repaint-to-propagate-style-changes/3485654#3485654
      var redraw = document.getElementById('login-dropdown-list');
      redraw.style.display = 'none';
      redraw.offsetHeight; // it seems that this line does nothing but is necessary for the redraw to work
      redraw.style.display = 'block';
    },
    'click #forgot-password-link': function () {
      loginButtonsSession.resetMessages();

      // store values of fields before swtiching to the signup form
      var email = trimmedElementValueById('login-email');
      var usernameOrEmail = trimmedElementValueById('login-username-or-email');

      loginButtonsSession.set('inSignupFlow', false);
      loginButtonsSession.set('inForgotPasswordFlow', true);
      // force the ui to update so that we have the approprate fields to fill in
      Meteor.flush();

      // update new fields with appropriate defaults
      if (email !== null)
        document.getElementById('forgot-password-email').value = email;
      else if (usernameOrEmail !== null)
        if (usernameOrEmail.indexOf('@') !== -1)
          document.getElementById('forgot-password-email').value = usernameOrEmail;

    },
    'click #back-to-login-link': function () {
      loginButtonsSession.resetMessages();

      var username = trimmedElementValueById('login-username');
      var email = trimmedElementValueById('login-email')
            || trimmedElementValueById('forgot-password-email'); // Ughh. Standardize on names?

      loginButtonsSession.set('inSignupFlow', false);
      loginButtonsSession.set('inForgotPasswordFlow', false);
      // force the ui to update so that we have the approprate fields to fill in
      Meteor.flush();

      if (document.getElementById('login-username'))
        document.getElementById('login-username').value = username;
      if (document.getElementById('login-email'))
        document.getElementById('login-email').value = email;
      // "login-password" is preserved, since password fields aren't updated by Spark.
      if (document.getElementById('login-username-or-email'))
        document.getElementById('login-username-or-email').value = email || username;
    },
    'keypress #login-username, keypress #login-email, keypress #login-username-or-email, keypress #login-password, keypress #login-password-again': function (event) {
      if (event.keyCode === 13)
        loginOrSignup();
    }
  });

  // additional classes that can be helpful in styling the dropdown
  Template._loginButtonsLoggedOutDropdown.additionalClasses = function () {
    if (!Accounts.password) {
      return false;
    } else {
      if (loginButtonsSession.get('inSignupFlow')) {
        return 'login-form-create-account';
      } else if (loginButtonsSession.get('inForgotPasswordFlow')) {
        return 'login-form-forgot-password';
      } else {
        return 'login-form-sign-in';
      }
    }
  };

  Template._loginButtonsLoggedOutDropdown.dropdownVisible = function () {
    return loginButtonsSession.get('dropdownVisible');
  };

  Template._loginButtonsLoggedOutDropdown.hasPasswordService = function () {
    return Accounts._loginButtons.hasPasswordService();
  };

  // return all login services, with password last
  Template._loginButtonsLoggedOutAllServices.services = function () {
    return Accounts._loginButtons.getLoginServices();
  };

  Template._loginButtonsLoggedOutAllServices.isPasswordService = function () {
    return this.name === 'password';
  };

  Template._loginButtonsLoggedOutAllServices.hasOtherServices = function () {
    return Accounts._loginButtons.getLoginServices().length > 1;
  };

  Template._loginButtonsLoggedOutAllServices.hasPasswordService = function () {
    return Accounts._loginButtons.hasPasswordService();
  };

  Template._loginButtonsLoggedOutPasswordService.fields = function () {
    var loginFields = [
      {fieldName: 'username-or-email', fieldLabel: 'Username or Email',
       visible: function () {
         return _.contains(
           ["USERNAME_AND_EMAIL", "USERNAME_AND_OPTIONAL_EMAIL"],
           Accounts.ui._passwordSignupFields());
       }},
      {fieldName: 'username', fieldLabel: 'Username',
       visible: function () {
         return Accounts.ui._passwordSignupFields() === "USERNAME_ONLY";
       }},
      {fieldName: 'email', fieldLabel: 'Email', inputType: 'email',
       visible: function () {
         return Accounts.ui._passwordSignupFields() === "EMAIL_ONLY";
       }},
      {fieldName: 'password', fieldLabel: 'Password', inputType: 'password',
       visible: function () {
         return true;
       }}
    ];

    var signupFields = [
      {fieldName: 'username', fieldLabel: 'Username',
       visible: function () {
         return _.contains(
           ["USERNAME_AND_EMAIL", "USERNAME_AND_OPTIONAL_EMAIL", "USERNAME_ONLY"],
           Accounts.ui._passwordSignupFields());
       }},
      {fieldName: 'email', fieldLabel: 'Email', inputType: 'email',
       visible: function () {
         return _.contains(
           ["USERNAME_AND_EMAIL", "EMAIL_ONLY"],
           Accounts.ui._passwordSignupFields());
       }},
      {fieldName: 'email', fieldLabel: 'Email (optional)', inputType: 'email',
       visible: function () {
         return Accounts.ui._passwordSignupFields() === "USERNAME_AND_OPTIONAL_EMAIL";
       }},
      {fieldName: 'password', fieldLabel: 'Password', inputType: 'password',
       visible: function () {
         return true;
       }},
      {fieldName: 'password-again', fieldLabel: 'Password (again)',
       inputType: 'password',
       visible: function () {
         // No need to make users double-enter their password if
         // they'll necessarily have an email set, since they can use
         // the "forgot password" flow.
         return _.contains(
           ["USERNAME_AND_OPTIONAL_EMAIL", "USERNAME_ONLY"],
           Accounts.ui._passwordSignupFields());
       }}
    ];

    return loginButtonsSession.get('inSignupFlow') ? signupFields : loginFields;
  };

  Template._loginButtonsLoggedOutPasswordService.inForgotPasswordFlow = function () {
    return loginButtonsSession.get('inForgotPasswordFlow');
  };

  Template._loginButtonsLoggedOutPasswordService.inLoginFlow = function () {
    return !loginButtonsSession.get('inSignupFlow') && !loginButtonsSession.get('inForgotPasswordFlow');
  };

  Template._loginButtonsLoggedOutPasswordService.inSignupFlow = function () {
    return loginButtonsSession.get('inSignupFlow');
  };

  Template._loginButtonsLoggedOutPasswordService.showCreateAccountLink = function () {
    return !Accounts._options.forbidClientAccountCreation;
  };

  Template._loginButtonsLoggedOutPasswordService.showForgotPasswordLink = function () {
    return _.contains(
      ["USERNAME_AND_EMAIL", "USERNAME_AND_OPTIONAL_EMAIL", "EMAIL_ONLY"],
      Accounts.ui._passwordSignupFields());
  };

  Template._loginButtonsFormField.inputType = function () {
    return this.inputType || "text";
  };


  //
  // loginButtonsChangePassword template
  //

  Template._loginButtonsChangePassword.events({
    'keypress #login-old-password, keypress #login-password, keypress #login-password-again': function (event) {
      if (event.keyCode === 13)
        changePassword();
    },
    'click #login-buttons-do-change-password': function () {
      changePassword();
    }
  });

  Template._loginButtonsChangePassword.fields = function () {
    return [
      {fieldName: 'old-password', fieldLabel: 'Current Password', inputType: 'password',
       visible: function () {
         return true;
       }},
      {fieldName: 'password', fieldLabel: 'New Password', inputType: 'password',
       visible: function () {
         return true;
       }},
      {fieldName: 'password-again', fieldLabel: 'New Password (again)',
       inputType: 'password',
       visible: function () {
         // No need to make users double-enter their password if
         // they'll necessarily have an email set, since they can use
         // the "forgot password" flow.
         return _.contains(
           ["USERNAME_AND_OPTIONAL_EMAIL", "USERNAME_ONLY"],
           Accounts.ui._passwordSignupFields());
       }}
    ];
  };


  //
  // helpers
  //

  var elementValueById = function(id) {
    var element = document.getElementById(id);
    if (!element)
      return null;
    else
      return element.value;
  };

  var trimmedElementValueById = function(id) {
    var element = document.getElementById(id);
    if (!element)
      return null;
    else
      return element.value.replace(/^\s*|\s*$/g, ""); // trim;
  };

  var loginOrSignup = function () {
    if (loginButtonsSession.get('inSignupFlow'))
      signup();
    else
      login();
  };

  var login = function () {
    loginButtonsSession.resetMessages();

    var username = trimmedElementValueById('login-username');
    var email = trimmedElementValueById('login-email');
    var usernameOrEmail = trimmedElementValueById('login-username-or-email');
    // notably not trimmed. a password could (?) start or end with a space
    var password = elementValueById('login-password');

    var loginSelector;
    if (username !== null) {
      if (!Accounts._loginButtons.validateUsername(username))
        return;
      else
        loginSelector = {username: username};
    } else if (email !== null) {
      if (!Accounts._loginButtons.validateEmail(email))
        return;
      else
        loginSelector = {email: email};
    } else if (usernameOrEmail !== null) {
      // XXX not sure how we should validate this. but this seems good enough (for now),
      // since an email must have at least 3 characters anyways
      if (!Accounts._loginButtons.validateUsername(usernameOrEmail))
        return;
      else
        loginSelector = usernameOrEmail;
    } else {
      throw new Error("Unexpected -- no element to use as a login user selector");
    }

    Meteor.loginWithPassword(loginSelector, password, function (error, result) {
      if (error) {
        loginButtonsSession.errorMessage(error.reason || "Unknown error");
      } else {
        loginButtonsSession.closeDropdown();
      }
    });
  };

  var signup = function () {
    loginButtonsSession.resetMessages();

    var options = {}; // to be passed to Accounts.createUser

    var username = trimmedElementValueById('login-username');
    if (username !== null) {
      if (!Accounts._loginButtons.validateUsername(username))
        return;
      else
        options.username = username;
    }

    var email = trimmedElementValueById('login-email');
    if (email !== null) {
      if (!Accounts._loginButtons.validateEmail(email))
        return;
      else
        options.email = email;
    }

    // notably not trimmed. a password could (?) start or end with a space
    var password = elementValueById('login-password');
    if (!Accounts._loginButtons.validatePassword(password))
      return;
    else
      options.password = password;

    if (!matchPasswordAgainIfPresent())
      return;

    Accounts.createUser(options, function (error) {
      if (error) {
        loginButtonsSession.errorMessage(error.reason || "Unknown error");
      } else {
        loginButtonsSession.closeDropdown();
      }
    });
  };

  var forgotPassword = function () {
    loginButtonsSession.resetMessages();

    var email = trimmedElementValueById("forgot-password-email");
    if (email.indexOf('@') !== -1) {
      Accounts.forgotPassword({email: email}, function (error) {
        if (error)
          loginButtonsSession.errorMessage(error.reason || "Unknown error");
        else
          loginButtonsSession.infoMessage("Email sent");
      });
    } else {
      loginButtonsSession.errorMessage("Invalid email");
    }
  };

  var changePassword = function () {
    loginButtonsSession.resetMessages();

    // notably not trimmed. a password could (?) start or end with a space
    var oldPassword = elementValueById('login-old-password');

    // notably not trimmed. a password could (?) start or end with a space
    var password = elementValueById('login-password');
    if (!Accounts._loginButtons.validatePassword(password))
      return;

    if (!matchPasswordAgainIfPresent())
      return;

    Accounts.changePassword(oldPassword, password, function (error) {
      if (error) {
        loginButtonsSession.errorMessage(error.reason || "Unknown error");
      } else {
        loginButtonsSession.set('inChangePasswordFlow', false);
        loginButtonsSession.set('inMessageOnlyFlow', true);
        loginButtonsSession.infoMessage("Password changed");
      }
    });
  };

  var matchPasswordAgainIfPresent = function () {
    // notably not trimmed. a password could (?) start or end with a space
    var passwordAgain = elementValueById('login-password-again');
    if (passwordAgain !== null) {
      // notably not trimmed. a password could (?) start or end with a space
      var password = elementValueById('login-password');
      if (password !== passwordAgain) {
        loginButtonsSession.errorMessage("Passwords don't match");
        return false;
      }
    }
    return true;
  };

  var correctDropdownZIndexes = function () {
    // IE <= 7 has a z-index bug that means we can't just give the
    // dropdown a z-index and expect it to stack above the rest of
    // the page even if nothing else has a z-index.  The nature of
    // the bug is that all positioned elements are considered to
    // have z-index:0 (not auto) and therefore start new stacking
    // contexts, with ties broken by page order.
    //
    // The fix, then is to give z-index:1 to all ancestors
    // of the dropdown having z-index:0.
    for(var n = document.getElementById('login-dropdown-list').parentNode;
        n.nodeName !== 'BODY';
        n = n.parentNode)
      if (n.style.zIndex === 0)
        n.style.zIndex = 1;
  };


}) ();

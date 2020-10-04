import { passwordSignupFields } from './accounts_ui.js';
import {
  displayName,
  getLoginServices,
  hasPasswordService,
  validateUsername,
  validateEmail,
  validatePassword,
} from './login_buttons.js';

// for convenience
const loginButtonsSession = Accounts._loginButtonsSession;

//
// helpers
//

const elementValueById = id => {
  const element = document.getElementById(id);
  if (!element)
    return null;
  else
    return element.value;
};

const trimmedElementValueById = id => {
  const element = document.getElementById(id);
  if (!element)
    return null;
  else
    return element.value.replace(/^\s*|\s*$/g, ""); // trim() doesn't work on IE8;
};

const loginOrSignup = () => {
  if (loginButtonsSession.get('inSignupFlow'))
    signup();
  else
    login();
};

const login = () => {
  loginButtonsSession.resetMessages();

  const username = trimmedElementValueById('login-username');
  const email = trimmedElementValueById('login-email');
  const usernameOrEmail = trimmedElementValueById('login-username-or-email');
  // notably not trimmed. a password could (?) start or end with a space
  const password = elementValueById('login-password');

  let loginSelector;
  if (username !== null) {
    if (!validateUsername(username))
      return;
    else
      loginSelector = {username: username};
  } else if (email !== null) {
    if (!validateEmail(email))
      return;
    else
      loginSelector = {email: email};
  } else if (usernameOrEmail !== null) {
    // XXX not sure how we should validate this. but this seems good enough (for now),
    // since an email must have at least 3 characters anyways
    if (!validateUsername(usernameOrEmail))
      return;
    else
      loginSelector = usernameOrEmail;
  } else {
    throw new Error("Unexpected -- no element to use as a login user selector");
  }

  Meteor.loginWithPassword(loginSelector, password, (error, result) => {
    if (error) {
      loginButtonsSession.errorMessage(error.reason || "Unknown error");
    } else {
      loginButtonsSession.closeDropdown();
    }
  });
};

const signup = () => {
  loginButtonsSession.resetMessages();

  const options = {}; // to be passed to Accounts.createUser

  const username = trimmedElementValueById('login-username');
  if (username !== null) {
    if (!validateUsername(username))
      return;
    else
      options.username = username;
  }

  const email = trimmedElementValueById('login-email');
  if (email !== null) {
    if (!validateEmail(email))
      return;
    else
      options.email = email;
  }

  // notably not trimmed. a password could (?) start or end with a space
  const password = elementValueById('login-password');
  if (!validatePassword(password))
    return;
  else
    options.password = password;

  if (!matchPasswordAgainIfPresent())
    return;

  Accounts.createUser(options, error => {
    if (error) {
      loginButtonsSession.errorMessage(error.reason || "Unknown error");
    } else {
      loginButtonsSession.closeDropdown();
    }
  });
};

const forgotPassword = () => {
  loginButtonsSession.resetMessages();

  const email = trimmedElementValueById("forgot-password-email");
  if (email.includes('@')) {
    Accounts.forgotPassword({email: email}, error => {
      if (error)
        loginButtonsSession.errorMessage(error.reason || "Unknown error");
      else
        loginButtonsSession.infoMessage("Email sent");
    });
  } else {
    loginButtonsSession.errorMessage("Invalid email");
  }
};

const changePassword = () => {
  loginButtonsSession.resetMessages();

  // notably not trimmed. a password could (?) start or end with a space
  const oldPassword = elementValueById('login-old-password');

  // notably not trimmed. a password could (?) start or end with a space
  const password = elementValueById('login-password');
  if (!validatePassword(password))
    return;

  if (!matchPasswordAgainIfPresent())
    return;

  Accounts.changePassword(oldPassword, password, error => {
    if (error) {
      loginButtonsSession.errorMessage(error.reason || "Unknown error");
    } else {
      loginButtonsSession.set('inChangePasswordFlow', false);
      loginButtonsSession.set('inMessageOnlyFlow', true);
      loginButtonsSession.infoMessage("Password changed");
    }
  });
};

const matchPasswordAgainIfPresent = () => {
  // notably not trimmed. a password could (?) start or end with a space
  const passwordAgain = elementValueById('login-password-again');
  if (passwordAgain !== null) {
    // notably not trimmed. a password could (?) start or end with a space
    const password = elementValueById('login-password');
    if (password !== passwordAgain) {
      loginButtonsSession.errorMessage("Passwords don't match");
      return false;
    }
  }
  return true;
};

// Utility containment function that works with both arrays and single values
const isInPasswordSignupFields = (fieldOrFields) => {
  const signupFields = passwordSignupFields();

  if (Array.isArray(fieldOrFields)) {
    return signupFields.reduce(
      (prev, field) => prev && fieldOrFields.includes(field),
      true,
    )
  }

  return signupFields.includes(fieldOrFields);
};

// events shared between loginButtonsLoggedOutDropdown and
// loginButtonsLoggedInDropdown
Template.loginButtons.events({
  'click #login-name-link, click #login-sign-in-link': () =>
    loginButtonsSession.set('dropdownVisible', true),
  'click .login-close-text': loginButtonsSession.closeDropdown,
});


//
// loginButtonsLoggedInDropdown template and related
//

Template._loginButtonsLoggedInDropdown.events({
  'click #login-buttons-open-change-password': () => {
    loginButtonsSession.resetMessages();
    loginButtonsSession.set('inChangePasswordFlow', true);
  }
});

Template._loginButtonsLoggedInDropdown.helpers({
  displayName,
  inChangePasswordFlow: () => loginButtonsSession.get('inChangePasswordFlow'),
  inMessageOnlyFlow: () => loginButtonsSession.get('inMessageOnlyFlow'),
  dropdownVisible: () => loginButtonsSession.get('dropdownVisible'),
});

Template._loginButtonsLoggedInDropdownActions.helpers({
  allowChangingPassword: () => {
    // it would be more correct to check whether the user has a password set,
    // but in order to do that we'd have to send more data down to the client,
    // and it'd be preferable not to send down the entire service.password document.
    //
    // instead we use the heuristic: if the user has a username or email set.
    const user = Meteor.user();
    return user.username || (user.emails && user.emails[0] && user.emails[0].address);
  }
});


//
// loginButtonsLoggedOutDropdown template and related
//

Template._loginButtonsLoggedOutDropdown.events({
  'click #login-buttons-password': event => {
    event.preventDefault();
    loginOrSignup();
  },

  'keypress #forgot-password-email': event => {
    if (event.keyCode === 13)
      forgotPassword();
  },

  'click #login-buttons-forgot-password': forgotPassword,

  'click #signup-link': () => {
    loginButtonsSession.resetMessages();

    // store values of fields before swtiching to the signup form
    const username = trimmedElementValueById('login-username');
    const email = trimmedElementValueById('login-email');
    const usernameOrEmail = trimmedElementValueById('login-username-or-email');
    // notably not trimmed. a password could (?) start or end with a space
    const password = elementValueById('login-password');

    loginButtonsSession.set('inSignupFlow', true);
    loginButtonsSession.set('inForgotPasswordFlow', false);
    // force the ui to update so that we have the approprate fields to fill in
    Tracker.flush();

    // update new fields with appropriate defaults
    if (username !== null)
      document.getElementById('login-username').value = username;
    else if (email !== null)
      document.getElementById('login-email').value = email;
    else if (usernameOrEmail !== null)
      if (!usernameOrEmail.includes('@'))
        document.getElementById('login-username').value = usernameOrEmail;
    else
      document.getElementById('login-email').value = usernameOrEmail;

    if (password !== null)
      document.getElementById('login-password').value = password;

    // Force redrawing the `login-dropdown-list` element because of
    // a bizarre Chrome bug in which part of the DIV is not redrawn
    // in case you had tried to unsuccessfully log in before
    // switching to the signup form.
    //
    // Found tip on how to force a redraw on
    // http://stackoverflow.com/questions/3485365/how-can-i-force-webkit-to-redraw-repaint-to-propagate-style-changes/3485654#3485654
    const redraw = document.getElementById('login-dropdown-list');
    redraw.style.display = 'none';
    redraw.offsetHeight; // it seems that this line does nothing but is necessary for the redraw to work
    redraw.style.display = 'block';
  },
  'click #forgot-password-link': () => {
    loginButtonsSession.resetMessages();

    // store values of fields before swtiching to the signup form
    const email = trimmedElementValueById('login-email');
    const usernameOrEmail = trimmedElementValueById('login-username-or-email');

    loginButtonsSession.set('inSignupFlow', false);
    loginButtonsSession.set('inForgotPasswordFlow', true);
    // force the ui to update so that we have the approprate fields to fill in
    Tracker.flush();

    // update new fields with appropriate defaults
    if (email !== null)
      document.getElementById('forgot-password-email').value = email;
    else if (usernameOrEmail !== null)
      if (usernameOrEmail.includes('@'))
        document.getElementById('forgot-password-email').value = usernameOrEmail;

  },
  'click #back-to-login-link': () => {
    loginButtonsSession.resetMessages();

    const username = trimmedElementValueById('login-username');
    const email = trimmedElementValueById('login-email')
          || trimmedElementValueById('forgot-password-email'); // Ughh. Standardize on names?
    // notably not trimmed. a password could (?) start or end with a space
    const password = elementValueById('login-password');

    loginButtonsSession.set('inSignupFlow', false);
    loginButtonsSession.set('inForgotPasswordFlow', false);
    // force the ui to update so that we have the approprate fields to fill in
    Tracker.flush();

    if (document.getElementById('login-username') && username !== null)
      document.getElementById('login-username').value = username;
    if (document.getElementById('login-email') && email !== null)
      document.getElementById('login-email').value = email;

    const usernameOrEmailInput = document.getElementById('login-username-or-email');
    if (usernameOrEmailInput) {
      if (email !== null)
        usernameOrEmailInput.value = email;
      if (username !== null)
        usernameOrEmailInput.value = username;
    }

    if (password !== null)
      document.getElementById('login-password').value = password;
  },
  'keypress #login-username, keypress #login-email, keypress #login-username-or-email, keypress #login-password, keypress #login-password-again': event => {
    if (event.keyCode === 13)
      loginOrSignup();
  }
});

Template._loginButtonsLoggedOutDropdown.helpers({
  // additional classes that can be helpful in styling the dropdown
  additionalClasses: () => {
    if (!hasPasswordService()) {
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
  },

  dropdownVisible: () => loginButtonsSession.get('dropdownVisible'),

  hasPasswordService,
});

// return all login services, with password last
Template._loginButtonsLoggedOutAllServices.helpers({
  services: getLoginServices,
  isPasswordService: function () {
    return this.name === 'password';
  },
  hasOtherServices: () => getLoginServices().length > 1,
  hasPasswordService,
});

Template._loginButtonsLoggedOutPasswordService.helpers({
  fields: () => {
    const loginFields = [
      {fieldName: 'username-or-email', fieldLabel: 'Username or Email',
        autocomplete: 'username email',
        visible: () => isInPasswordSignupFields(
          ["USERNAME_AND_EMAIL", "USERNAME_AND_OPTIONAL_EMAIL"]
        ),
      },
      {fieldName: 'username', fieldLabel: 'Username', autocomplete: 'username',
        visible: () => isInPasswordSignupFields("USERNAME_ONLY"),
      },
      {fieldName: 'email', fieldLabel: 'Email', inputType: 'email',
        autocomplete: 'email',
        visible: () => isInPasswordSignupFields("EMAIL_ONLY"),
      },
      {fieldName: 'password', fieldLabel: 'Password', inputType: 'password',
        autocomplete: 'current-password',
        visible: () => true,
      }
    ];

    const signupFields = [
      {fieldName: 'username', fieldLabel: 'Username', autocomplete: 'username',
        visible: () => isInPasswordSignupFields([
          "USERNAME_AND_EMAIL",
          "USERNAME_AND_OPTIONAL_EMAIL",
          "USERNAME_ONLY",
        ]),
      },
      {fieldName: 'email', fieldLabel: 'Email', inputType: 'email',
        autocomplete: 'email',
        visible: () => isInPasswordSignupFields(
          ["USERNAME_AND_EMAIL", "EMAIL_ONLY"]
        ),
      },
      {fieldName: 'email', fieldLabel: 'Email (optional)', inputType: 'email',
        autocomplete: 'email',
        visible: () => isInPasswordSignupFields("USERNAME_AND_OPTIONAL_EMAIL"),
      },
      {fieldName: 'password', fieldLabel: 'Password', inputType: 'password',
        autocomplete: 'new-password',
        visible: () => true,
      },
      {fieldName: 'password-again', fieldLabel: 'Password (again)',
       inputType: 'password', autocomplete: 'new-password',
        // No need to make users double-enter their password if
        // they'll necessarily have an email set, since they can use
        // the "forgot password" flow.
        visible: () => isInPasswordSignupFields(
          ["USERNAME_AND_OPTIONAL_EMAIL", "USERNAME_ONLY"]
        ),
      },
    ];

    return loginButtonsSession.get('inSignupFlow') ? signupFields : loginFields;
  },

  inForgotPasswordFlow: () => loginButtonsSession.get('inForgotPasswordFlow'),

  inLoginFlow: () =>
    !loginButtonsSession.get('inSignupFlow') &&
    !loginButtonsSession.get('inForgotPasswordFlow'),

  inSignupFlow: () => loginButtonsSession.get('inSignupFlow'),

  showCreateAccountLink: () => !Accounts._options.forbidClientAccountCreation,

  showForgotPasswordLink: () => isInPasswordSignupFields(
    ["USERNAME_AND_EMAIL", "USERNAME_AND_OPTIONAL_EMAIL", "EMAIL_ONLY"]
  ),
});

Template._loginButtonsFormField.helpers({
  inputType: function () {
    return this.inputType || "text"
  }
});


//
// loginButtonsChangePassword template
//

Template._loginButtonsChangePassword.events({
  'keypress #login-old-password, keypress #login-password, keypress #login-password-again': event => {
    if (event.keyCode === 13)
      changePassword();
  },
  'click #login-buttons-do-change-password': changePassword,
});

Template._loginButtonsChangePassword.helpers({
  fields: () => {
    const { username, emails } = Meteor.user()
    let email;
    if (emails) {
      email = emails[0].address;
    }
    return [
      // The username and email fields are included here to address an
      // accessibility warning in Chrome, but the fields don't actually display.
      // The warning states that there should be an optionally hidden
      // username/email field on password forms.
      // XXX I think we should not use a CSS class here because this is the
      // `unstyled` package. So instead we apply an inline style.
      {fieldName: 'username', fieldLabel: 'Username', autocomplete: 'username',
        fieldStyle: 'display: none;', fieldValue: username,
        visible: () => isInPasswordSignupFields([
          "USERNAME_AND_EMAIL",
          "USERNAME_AND_OPTIONAL_EMAIL",
          "USERNAME_ONLY",
        ]),
      },
      {fieldName: 'email', fieldLabel: 'Email', inputType: 'email',
        autocomplete: 'email', fieldStyle: 'display: none;', fieldValue: email,
        visible: () => isInPasswordSignupFields(
          ["USERNAME_AND_EMAIL", "EMAIL_ONLY"]
        ),
      },
      {fieldName: 'old-password', fieldLabel: 'Current Password', inputType: 'password',
        autocomplete: 'current-password', visible: () => true,
      },
      {fieldName: 'password', fieldLabel: 'New Password', inputType: 'password',
        autocomplete: 'new-password', visible: () => true,
      },
      {fieldName: 'password-again', fieldLabel: 'New Password (again)',
        inputType: 'password', autocomplete: 'new-password',
        // No need to make users double-enter their password if
        // they'll necessarily have an email set, since they can use
        // the "forgot password" flow.
        visible: () => isInPasswordSignupFields(
          ["USERNAME_AND_OPTIONAL_EMAIL", "USERNAME_ONLY"]
        ),
      },
    ];
  }
});

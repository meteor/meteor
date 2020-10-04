import { displayName, dropdown, validatePassword } from './login_buttons.js';
// for convenience
const loginButtonsSession = Accounts._loginButtonsSession;

// since we don't want to pass around the callback that we get from our event
// handlers, we just make it a variable for the whole file
let doneCallback;

Accounts.onResetPasswordLink((token, done) => {
  loginButtonsSession.set("resetPasswordToken", token);
  doneCallback = done;
});

Accounts.onEnrollmentLink((token, done) => {
  loginButtonsSession.set("enrollAccountToken", token);
  doneCallback = done;
});

Accounts.onEmailVerificationLink((token, done) => {
  Accounts.verifyEmail(token, error => {
    if (! error) {
      loginButtonsSession.set('justVerifiedEmail', true);
    }

    done();
    // XXX show something if there was an error.
  });
});


//
// resetPasswordDialog template
//

Template._resetPasswordDialog.events({
  'click #login-buttons-reset-password-button': () => resetPassword(),
  'keypress #reset-password-new-password': event => {
    if (event.keyCode === 13)
      resetPassword();
  },
  'click #login-buttons-cancel-reset-password': () => {
    loginButtonsSession.set('resetPasswordToken', null);
    if (doneCallback)
      doneCallback();
  }
});

const resetPassword = () => {
  loginButtonsSession.resetMessages();
  const newPassword = document.getElementById('reset-password-new-password').value;
  if (!validatePassword(newPassword))
    return;

  Accounts.resetPassword(
    loginButtonsSession.get('resetPasswordToken'), newPassword,
    error => {
      if (error) {
        loginButtonsSession.errorMessage(error.reason || "Unknown error");
      } else {
        loginButtonsSession.set('resetPasswordToken', null);
        loginButtonsSession.set('justResetPassword', true);
        if (doneCallback)
          doneCallback();
      }
    });
};

Template._resetPasswordDialog.helpers({
  displayName,
  inResetPasswordFlow: () => loginButtonsSession.get('resetPasswordToken'),
});

//
// justResetPasswordDialog template
//

Template._justResetPasswordDialog.events({
  'click #just-verified-dismiss-button': () =>
    loginButtonsSession.set('justResetPassword', false),
});

Template._justResetPasswordDialog.helpers({
  visible: () => loginButtonsSession.get('justResetPassword'),
  displayName,
});



//
// enrollAccountDialog template
//

const enrollAccount = () => {
  loginButtonsSession.resetMessages();
  const password = document.getElementById('enroll-account-password').value;
  if (!validatePassword(password))
    return;

  Accounts.resetPassword(
    loginButtonsSession.get('enrollAccountToken'), password,
    error => {
      if (error) {
        loginButtonsSession.errorMessage(error.reason || "Unknown error");
      } else {
        loginButtonsSession.set('enrollAccountToken', null);
        if (doneCallback)
          doneCallback();
      }
    });
};

Template._enrollAccountDialog.events({
  'click #login-buttons-enroll-account-button': enrollAccount,
  'keypress #enroll-account-password': event => {
    if (event.keyCode === 13)
      enrollAccount();
  },
  'click #login-buttons-cancel-enroll-account': () => {
    loginButtonsSession.set('enrollAccountToken', null);
    if (doneCallback)
      doneCallback();
  }
});

Template._enrollAccountDialog.helpers({
  displayName,
  inEnrollAccountFlow: () => loginButtonsSession.get('enrollAccountToken'),
});


//
// justVerifiedEmailDialog template
//

Template._justVerifiedEmailDialog.events({
  'click #just-verified-dismiss-button': () =>
    loginButtonsSession.set('justVerifiedEmail', false),
});

Template._justVerifiedEmailDialog.helpers({
  visible: () => loginButtonsSession.get('justVerifiedEmail'),
  displayName,
});


//
// loginButtonsMessagesDialog template
//

Template._loginButtonsMessagesDialog.events({
  'click #messages-dialog-dismiss-button': () =>
    loginButtonsSession.resetMessages(),
});

Template._loginButtonsMessagesDialog.helpers({
  visible: () => {
    const hasMessage = loginButtonsSession.get('infoMessage') || loginButtonsSession.get('errorMessage');
    return !dropdown() && hasMessage;
  }
});


//
// configureLoginServiceDialog template
//

Template._configureLoginServiceDialog.events({
  'click .configure-login-service-dismiss-button': () =>
    loginButtonsSession.set('configureLoginServiceDialogVisible', false),
  'click #configure-login-service-dialog-save-configuration': () => {
    if (loginButtonsSession.get('configureLoginServiceDialogVisible') &&
        ! loginButtonsSession.get('configureLoginServiceDialogSaveDisabled')) {
      // Prepare the configuration document for this login service
      const serviceName = loginButtonsSession.get('configureLoginServiceDialogServiceName');
      const configuration = {
        service: serviceName
      };

      // Fetch the value of each input field
      configurationFields().forEach(field => {
        configuration[field.property] = document.getElementById(
          `configure-login-service-dialog-${field.property}`).value
          .replace(/^\s*|\s*$/g, ""); // trim() doesnt work on IE8;
      });

      // Replacement of single use of jQuery in this package so we can remove
      // the dependency
      const inputs = [].slice.call( // Because HTMLCollections aren't arrays
        document
          .getElementById('configure-login-service-dialog')
          .getElementsByTagName('input')
      );

      configuration.loginStyle =
        document.querySelector('#configure-login-service-dialog input[name="loginStyle"]:checked').value;

      // Configure this login service
      Accounts.connection.call(
        "configureLoginService", configuration, (error, result) => {
          if (error)
            Meteor._debug(`Error configuring login service ${serviceName}`,
                          error);
          else
            loginButtonsSession.set('configureLoginServiceDialogVisible',
                                    false);
        });
    }
  },
  // IE8 doesn't support the 'input' event, so we'll run this on the keyup as
  // well. (Keeping the 'input' event means that this also fires when you use
  // the mouse to change the contents of the field, eg 'Cut' menu item.)
  'input, keyup input': event => {
    // if the event fired on one of the configuration input fields,
    // check whether we should enable the 'save configuration' button
    if (event.target.id.indexOf('configure-login-service-dialog') === 0)
      updateSaveDisabled();
  }
});

// check whether the 'save configuration' button should be enabled.
// this is a really strange way to implement this and a Forms
// Abstraction would make all of this reactive, and simpler.
const updateSaveDisabled = () => {
  const anyFieldEmpty = configurationFields().reduce((prev, field) =>
    prev || document.getElementById(
      `configure-login-service-dialog-${field.property}`
    ).value === '',
    false
  );

  loginButtonsSession.set('configureLoginServiceDialogSaveDisabled', anyFieldEmpty);
};

// Returns the appropriate template for this login service.  This
// template should be defined in the service's package
Template._configureLoginServiceDialog.templateForService = serviceName => {
  serviceName = serviceName || loginButtonsSession.get('configureLoginServiceDialogServiceName');
  // XXX Service providers should be able to specify their configuration
  // template name.
  return Template[`configureLoginServiceDialogFor${
                  serviceName === 'meteor-developer' ?
                   'MeteorDeveloper' :
                   capitalize(serviceName)}`];
};

const configurationFields = () => {
  const template = Template._configureLoginServiceDialog.templateForService();
  return template.fields();
};

Template._configureLoginServiceDialog.helpers({
  configurationFields,
  visible: () => loginButtonsSession.get('configureLoginServiceDialogVisible'),
  // renders the appropriate template
  configurationSteps: () =>
    Template._configureLoginServiceDialog.templateForService(),
  saveDisabled: () =>
    loginButtonsSession.get('configureLoginServiceDialogSaveDisabled'),
});

// XXX from http://epeli.github.com/underscore.string/lib/underscore.string.js
const capitalize = str => {
  str = str == null ? '' : String(str);
  return str.charAt(0).toUpperCase() + str.slice(1);
};

Template._configureLoginOnDesktopDialog.helpers({
  visible: () => loginButtonsSession.get('configureOnDesktopVisible'),
});

Template._configureLoginOnDesktopDialog.events({
  'click #configure-on-desktop-dismiss-button': () =>
    loginButtonsSession.set('configureOnDesktopVisible', false),
});

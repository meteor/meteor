import { getLoginServices } from './login_buttons.js';

// for convenience
const loginButtonsSession = Accounts._loginButtonsSession;


const loginResultCallback = (serviceName, err) => {
  if (!err) {
    loginButtonsSession.closeDropdown();
  } else if (err instanceof Accounts.LoginCancelledError) {
    // do nothing
  } else if (err instanceof ServiceConfiguration.ConfigError) {
    if (Template._configureLoginServiceDialog.templateForService(serviceName)) {
      loginButtonsSession.configureService(serviceName);
    } else {
      loginButtonsSession.errorMessage(
        `No configuration for ${capitalize(serviceName)}.\n` +
        "Use `ServiceConfiguration` to configure it or " +
        `install the \`${serviceName}-config-ui\` package.`
      );
    }
  } else {
    loginButtonsSession.errorMessage(err.reason || "Unknown error");
  }
};


// In the login redirect flow, we'll have the result of the login
// attempt at page load time when we're redirected back to the
// application.  Register a callback to update the UI (i.e. to close
// the dialog on a successful login or display the error on a failed
// login).
//
Accounts.onPageLoadLogin(attemptInfo => {
  // Ignore if we have a left over login attempt for a service that is no longer registered.
  if (
    getLoginServices()
      .map(service => service.name)
      .includes(attemptInfo.type)
  )
    loginResultCallback(attemptInfo.type, attemptInfo.error);
});


Template._loginButtonsLoggedOutSingleLoginButton.events({
  'click .login-button': function () {
    const serviceName = this.name;
    loginButtonsSession.resetMessages();

    // XXX Service providers should be able to specify their
    // `Meteor.loginWithX` method name.
    const loginWithService = Meteor[`loginWith${
                                  (serviceName === 'meteor-developer' ?
                                   'MeteorDeveloperAccount' :
                                   capitalize(serviceName))}`];

    const options = {}; // use default scope unless specified
    if (Accounts.ui._options.requestPermissions[serviceName])
      options.requestPermissions = Accounts.ui._options.requestPermissions[serviceName];
    if (Accounts.ui._options.requestOfflineToken[serviceName])
      options.requestOfflineToken = Accounts.ui._options.requestOfflineToken[serviceName];
    if (Accounts.ui._options.forceApprovalPrompt[serviceName])
      options.forceApprovalPrompt = Accounts.ui._options.forceApprovalPrompt[serviceName];

    loginWithService(options, err => {
      loginResultCallback(serviceName, err);
    });
  }
});

Template._loginButtonsLoggedOutSingleLoginButton.helpers({
  // not configured and has no config UI
  cannotConfigure: function () { 
    return !ServiceConfiguration.configurations.findOne({service: this.name}) && 
      !Template._configureLoginServiceDialog.templateForService(this.name);
  },
  configured: function () {
    return !!ServiceConfiguration.configurations.findOne({service: this.name});
  },
  capitalizedName: function () {
    if (this.name === 'github')
      // XXX we should allow service packages to set their capitalized name
      return 'GitHub';
    else if (this.name === 'meteor-developer')
      return 'Meteor';
    else
      return capitalize(this.name);
  }
});

// XXX from http://epeli.github.com/underscore.string/lib/underscore.string.js
const capitalize = input => {
  str = input == null ? '' : String(input);
  return str.charAt(0).toUpperCase() + str.slice(1);
};

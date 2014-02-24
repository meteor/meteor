// for convenience
var loginButtonsSession = Accounts._loginButtonsSession;

Template._loginButtonsLoggedOutSingleLoginButton.events({
  'click .login-button': function () {
    var serviceName = this.name;
    loginButtonsSession.resetMessages();
    var callback = function (err) {
      if (!err) {
        loginButtonsSession.closeDropdown();
      } else if (err instanceof Accounts.LoginCancelledError) {
        // do nothing
      } else if (err instanceof ServiceConfiguration.ConfigError) {
        loginButtonsSession.configureService(serviceName);
      } else {
        loginButtonsSession.errorMessage(err.reason || "Unknown error");
      }
    };

    // XXX Service providers should be able to specify their
    // `Meteor.loginWithX` method name.
    var loginWithService = Meteor["loginWith" +
                                  (serviceName === 'meteor-developer' ?
                                   'MeteorDeveloperAccount' :
                                   capitalize(serviceName))];

    var options = {}; // use default scope unless specified
    if (Accounts.ui._options.requestPermissions[serviceName])
      options.requestPermissions = Accounts.ui._options.requestPermissions[serviceName];
    if (Accounts.ui._options.requestOfflineToken[serviceName])
      options.requestOfflineToken = Accounts.ui._options.requestOfflineToken[serviceName];

    loginWithService(options, callback);
  }
});

Template._loginButtonsLoggedOutSingleLoginButton.configured = function () {
  return !!ServiceConfiguration.configurations.findOne({service: this.name});
};

Template._loginButtonsLoggedOutSingleLoginButton.capitalizedName = function () {
  if (this.name === 'github')
    // XXX we should allow service packages to set their capitalized name
    return 'GitHub';
  else if (this.name === 'meteor-developer')
    return 'Meteor';
  else
    return capitalize(this.name);
};

// XXX from http://epeli.github.com/underscore.string/lib/underscore.string.js
var capitalize = function(str){
  str = str == null ? '' : String(str);
  return str.charAt(0).toUpperCase() + str.slice(1);
};

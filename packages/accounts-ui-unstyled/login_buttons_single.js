(function () {
  // for convenience
  var loginButtonsSession = Accounts._loginButtonsSession;

  Template.loginButtonsLoggedOutSingleLoginButton.events({
    'click .login-button': function () {
      var serviceName = this.name;
      loginButtonsSession.resetMessages();
      Meteor["loginWith" + capitalize(serviceName)](function (err) {
        if (!err) {
          loginButtonsSession.closeDropdown();
        } else if (err instanceof Accounts.LoginCancelledError) {
          // do nothing
        } else if (err instanceof Accounts.ConfigError) {
          loginButtonsSession.configureService(serviceName);
        } else {
          loginButtonsSession.set('errorMessage', err.reason || "Unknown error");
        }
      });
    }
  });

  Template.loginButtonsLoggedOutSingleLoginButton.configured = function () {
    return !!Accounts.configuration.findOne({service: this.name});
  };

  Template.loginButtonsLoggedOutSingleLoginButton.capitalizedName = function () {
    if (this.name === 'github')
      // XXX we should allow service packages to set their capitalized name
      return 'GitHub';
    else
      return capitalize(this.name);
  };

  // XXX from http://epeli.github.com/underscore.string/lib/underscore.string.js
  var capitalize = function(str){
    str = str == null ? '' : String(str);
    return str.charAt(0).toUpperCase() + str.slice(1);
  };
}) ();
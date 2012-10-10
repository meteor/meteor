if (!Accounts.ui)
  Accounts.ui = {};

if (!Accounts.ui._options) {
  Accounts.ui._options = {
    requestPermissions: {}
  };
}


Accounts.ui.config = function(options) {
  if (options.passwordSignupFields) {
    if (_.contains([
      "USERNAME_AND_EMAIL",
      "USERNAME_AND_OPTIONAL_EMAIL",
      "USERNAME_ONLY",
      "EMAIL_ONLY"
    ], options.passwordSignupFields)) {
      if (Accounts.ui._options.passwordSignupFields)
        throw new Error("Can't set `passwordSignupFields` more than once");
      else
        Accounts.ui._options.passwordSignupFields = options.passwordSignupFields;
    } else {
      throw new Error("Invalid option for `passwordSignupFields`: " + options.passwordSignupFields);
    }
  }

  if (options.requestPermissions) {
    _.each(options.requestPermissions, function (scope, service) {
      if (Accounts.ui._options.requestPermissions[service])
        throw new Error("Can't set `requestPermissions` more than once for " + service);
      else
        Accounts.ui._options.requestPermissions[service] = scope;
    });
  }
};

Accounts.ui._passwordSignupFields = function () {
  return Accounts.ui._options.passwordSignupFields || "EMAIL_ONLY";
};


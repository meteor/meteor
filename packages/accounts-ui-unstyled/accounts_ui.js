if (!Accounts.ui)
  Accounts.ui = {};

if (!Accounts.ui._options) {
  Accounts.ui._options = {
    requestScope: {}
  };
}

Accounts.ui.config = function(options) {
  if (options.newUserWithPasswordHas) {
    if (_.contains([
      "USERNAME_AND_EMAIL",
      "USERNAME_AND_OPTIONAL_EMAIL",
      "USERNAME_ONLY",
      "EMAIL_ONLY"
    ], options.newUserWithPasswordHas)) {
      if (Accounts.ui._options.newUserWithPasswordHas)
        throw new Error("Can't set `newUserWithPasswordHas` more than once");
      else
        Accounts.ui._options.newUserWithPasswordHas = options.newUserWithPasswordHas;
    } else {
      throw new Error("Invalid option for `newUserWithPasswordHas`: " + newUserWithPasswordHas);
    }
  }

  if (options.requestScope) {
    _.each(options.requestScope, function (scope, service) {
      if (Accounts.ui._options.requestScope[service])
        throw new Error("Can't set `requestScope` more than once for " + service);
      else
        Accounts.ui._options.requestScope[service] = scope;
    });
  }
};

Accounts.ui._newUserWithPasswordHas = function () {
  return Accounts.ui._options.newUserWithPasswordHas || "USERNAME_AND_OPTIONAL_EMAIL";
};
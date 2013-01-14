if (!Accounts.ui)
  Accounts.ui = {};

if (!Accounts.ui._options) {
  Accounts.ui._options = {
    requestPermissions: {},
    requestOfflineToken: {},
    extraFields: []
  };
}


Accounts.ui.config = function(options) {
  // validate options keys
  var VALID_KEYS = ['passwordSignupFields', 'requestPermissions', 'requestOfflineToken', 'extraFields'];
  _.each(_.keys(options), function (key) {
    if (!_.contains(VALID_KEYS, key))
      throw new Error("Accounts.ui.config: Invalid key: " + key);
  });

  // deal with `passwordSignupFields`
  if (options.passwordSignupFields) {
    if (_.contains([
      "USERNAME_AND_EMAIL",
      "USERNAME_AND_OPTIONAL_EMAIL",
      "USERNAME_ONLY",
      "EMAIL_ONLY"
    ], options.passwordSignupFields)) {
      if (Accounts.ui._options.passwordSignupFields)
        throw new Error("Accounts.ui.config: Can't set `passwordSignupFields` more than once");
      else
        Accounts.ui._options.passwordSignupFields = options.passwordSignupFields;
    } else {
      throw new Error("Accounts.ui.config: Invalid option for `passwordSignupFields`: " + options.passwordSignupFields);
    }
  }

  // deal with `requestPermissions`
  if (options.requestPermissions) {
    _.each(options.requestPermissions, function (scope, service) {
      if (Accounts.ui._options.requestPermissions[service]) {
        throw new Error("Accounts.ui.config: Can't set `requestPermissions` more than once for " + service);
      } else if (!(scope instanceof Array)) {
        throw new Error("Accounts.ui.config: Value for `requestPermissions` must be an array");
      } else {
        Accounts.ui._options.requestPermissions[service] = scope;
      }
    });
  }

  // deal with `requestOfflineToken`
  if (options.requestOfflineToken) {
    _.each(options.requestOfflineToken, function (value, service) {
      if (service !== 'google')
        throw new Error("Accounts.ui.config: `requestOfflineToken` only supported for Google login at the moment.");

      if (Accounts.ui._options.requestOfflineToken[service]) {
        throw new Error("Accounts.ui.config: Can't set `requestOfflineToken` more than once for " + service);
      } else {
        Accounts.ui._options.requestOfflineToken[service] = value;
      }
    });
  }

  // deal with `extraFields`
  if (typeof options.extraFields !== 'object' || ! options.extraFields instanceof Array) {
    throw new Error("Accounts.ui.config: `extraFields` must be an array.");
  } else {
    if (options.extraFields) {
      _.each(options.extraFields, function (field, index) {
        if (! field.fieldName || ! field.fieldLabel)
          throw new Error("Accounts.ui.config: `extraFields` objects must have `fieldName` and `fieldLabel` attributes.");
        if (typeof field.visible === 'undefined')
          field.visible = true;
        Accounts.ui._options.extraFields[index] = field;
      });
    }
  }
};

Accounts.ui._passwordSignupFields = function () {
  return Accounts.ui._options.passwordSignupFields || "EMAIL_ONLY";
};


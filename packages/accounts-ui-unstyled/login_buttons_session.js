(function () {
  var VALID_KEYS = [
    'dropdownVisible',

    // XXX consider replacing these with one key that has an enum for values.
    'inSignupFlow',
    'inForgotPasswordFlow',
    'inChangePasswordFlow',
    'inMessageOnlyFlow',

    'errorMessage',
    'infoMessage',

    'resetPasswordToken',
    'enrollAccountToken',
    'justVerifiedEmail',

    'configureLoginServiceDialogVisible',
    'configureLoginServiceDialogServiceName',
    'configureLoginServiceDialogSaveDisabled'
  ];

  var validateKey = function (key) {
    if (!_.contains(VALID_KEYS, key))
      throw new Error("Invalid key in loginButtonsSession: " + key);
  };

  var KEY_PREFIX = "Meteor.loginButtons.";

  // XXX we should have a better pattern for code private to a package like this one
  Accounts._loginButtonsSession = {
    set: function(key, value) {
      validateKey(key);
      Session.set(KEY_PREFIX + key, value);
    },

    get: function(key) {
      validateKey(key);
      return Session.get(KEY_PREFIX + key);
    },

    closeDropdown: function () {
      this.set('inSignupFlow', false);
      this.set('inForgotPasswordFlow', false);
      this.set('inChangePasswordFlow', false);
      this.set('inMessageOnlyFlow', false);
      this.set('dropdownVisible', false);
      this.resetMessages();
    },

    resetMessages: function () {
      this.set("errorMessage", null);
      this.set("infoMessage", null);
    },

    configureService: function (name) {
      this.set('configureLoginServiceDialogVisible', true);
      this.set('configureLoginServiceDialogServiceName', name);
      this.set('configureLoginServiceDialogSaveDisabled', true);
    }
  };
}) ();

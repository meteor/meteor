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
      if (_.contains(['errorMessage', 'infoMessage'], key))
        throw new Error("Don't set errorMessage or infoMessage directly. Instead, use errorMessage() or infoMessage().");

      this._set(key, value);
    },

    _set: function(key, value) {
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

    infoMessage: function(message) {
      this._set("errorMessage", null);
      this._set("infoMessage", message);
      this.set("dropdownVisible", true); // See #OpenDropdownForMessage
    },

    errorMessage: function(message) {
      this._set("errorMessage", message);
      this._set("infoMessage", null);

      // #OpenDropdownForMessage
      // for the case that you're taking some action in the dropdown, and then you
      // get an error or message. notably has no effect in the single button case.
      this.set("dropdownVisible", true);
    },

    resetMessages: function () {
      this._set("errorMessage", null);
      this._set("infoMessage", null);
    },

    configureService: function (name) {
      this.set('configureLoginServiceDialogVisible', true);
      this.set('configureLoginServiceDialogServiceName', name);
      this.set('configureLoginServiceDialogSaveDisabled', true);
    }
  };
}) ();

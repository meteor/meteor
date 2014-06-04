// The server requested an upgrade from the old SRP password format,
// so supply the needed SRP identity to login.
var srpUpgradePath = function (selector, password, identity, callback) {
  Accounts.callLoginMethod({
    methodArguments: [{
      user: selector,
      srp: SHA256(identity + ":" + password),
      password: SHA256(password)
    }],
    userCallback: callback
  });
};

// Attempt to log in with a password.
//
// @param selector {String|Object} One of the following:
//   - {username: (username)}
//   - {email: (email)}
//   - a string which may be a username or email, depending on whether
//     it contains "@".
// @param password {String}
// @param callback {Function(error|undefined)}
Meteor.loginWithPassword = function (selector, password, callback) {
  if (typeof selector === 'string')
    if (selector.indexOf('@') === -1)
      selector = {username: selector};
    else
      selector = {email: selector};

  Accounts.callLoginMethod({
    methodArguments: [{
      user: selector,
      password: SHA256(password),
    }],
    userCallback: function (error, result) {
      if (error && error.error === 400 &&
          error.reason === 'old password format') {
        var details;
        try {
          details = EJSON.parse(error.details);
        } catch (e) {}
        if (!(details && details.format === 'srp'))
          callback(new Error("unknown old password format"));
        else
          srpUpgradePath(selector, password, details.identity, callback);
      }
      else if (error) {
        callback(error);
      } else {
        callback();
      }
    }
  });
};


// Attempt to log in as a new user.
Accounts.createUser = function (options, callback) {
  options = _.clone(options); // we'll be modifying options

  if (!options.password)
    throw new Error("Must set options.password");

  // Replace password with the hashed password.
  options.hashedPassword = SHA256(options.password);
  delete options.password;

  Accounts.callLoginMethod({
    methodName: 'createUser',
    methodArguments: [options],
    userCallback: callback
  });
};



// Change password. Must be logged in.
//
// @param oldPassword {String|null} By default servers no longer allow
//   changing password without the old password, but they could so we
//   support passing no password to the server and letting it decide.
// @param newPassword {String}
// @param callback {Function(error|undefined)}
Accounts.changePassword = function (oldPassword, newPassword, callback) {
  if (!Meteor.user()) {
    callback && callback(new Error("Must be logged in to change password."));
    return;
  }

  Accounts.connection.apply(
    'changePassword',
    [oldPassword ? SHA256(oldPassword) : null, SHA256(newPassword)],
    function (error, result) {
      if (error || !result) {
        callback && callback(
          error || new Error("No result from changePassword."));
      } else {
        callback && callback();
      }
    }
  );
};

// Sends an email to a user with a link that can be used to reset
// their password
//
// @param options {Object}
//   - email: (email)
// @param callback (optional) {Function(error|undefined)}
Accounts.forgotPassword = function(options, callback) {
  if (!options.email)
    throw new Error("Must pass options.email");
  Accounts.connection.call("forgotPassword", options, callback);
};

// Resets a password based on a token originally created by
// Accounts.forgotPassword, and then logs in the matching user.
//
// @param token {String}
// @param newPassword {String}
// @param callback (optional) {Function(error|undefined)}
Accounts.resetPassword = function(token, newPassword, callback) {
  if (!token)
    throw new Error("Need to pass token");
  if (!newPassword)
    throw new Error("Need to pass newPassword");

  Accounts.callLoginMethod({
    methodName: 'resetPassword',
    methodArguments: [token, SHA256(newPassword)],
    userCallback: callback});
};

// Verifies a user's email address based on a token originally
// created by Accounts.sendVerificationEmail
//
// @param token {String}
// @param callback (optional) {Function(error|undefined)}
Accounts.verifyEmail = function(token, callback) {
  if (!token)
    throw new Error("Need to pass token");

  Accounts.callLoginMethod({
    methodName: 'verifyEmail',
    methodArguments: [token],
    userCallback: callback});
};

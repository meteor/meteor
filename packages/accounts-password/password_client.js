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
      password: hashPassword(password)
    }],
    userCallback: function (error, result) {
      if (error && error.error === 400 &&
          error.reason === 'old password format') {
        // The "reason" string should match the error thrown in the
        // password login handler in password_server.js.

        // XXX COMPAT WITH 0.8.1.3
        // If this user's last login was with a previous version of
        // Meteor that used SRP, then the server throws this error to
        // indicate that we should try again. The error includes the
        // user's SRP identity. We provide a value derived from the
        // identity and the password to prove to the server that we know
        // the password without requiring a full SRP flow, as well as
        // SHA256(password), which the server bcrypts and stores in
        // place of the old SRP information for this user.
        srpUpgradePath({
          upgradeError: error,
          userSelector: selector,
          plaintextPassword: password
        }, callback);
      }
      else if (error) {
        callback(error);
      } else {
        callback();
      }
    }
  });
};

var hashPassword = function (password) {
  return {
    digest: SHA256(password),
    algorithm: "sha-256"
  };
};

// XXX COMPAT WITH 0.8.1.3
// The server requested an upgrade from the old SRP password format,
// so supply the needed SRP identity to login. Options:
//   - upgradeError: the error object that the server returned to tell
//     us to upgrade from SRP to bcrypt.
//   - userSelector: selector to retrieve the user object
//   - plaintextPassword: the password as a string
var srpUpgradePath = function (options, callback) {
  var details;
  try {
    details = EJSON.parse(options.upgradeError.details);
  } catch (e) {}
  if (!(details && details.format === 'srp')) {
    callback(new Meteor.Error(400,
                              "Password is old. Please reset your " +
                              "password."));
  } else {
    Accounts.callLoginMethod({
      methodArguments: [{
        user: options.userSelector,
        srp: SHA256(details.identity + ":" + options.plaintextPassword),
        password: hashPassword(options.plaintextPassword)
      }],
      userCallback: callback
    });
  }
};


// Attempt to log in as a new user.
Accounts.createUser = function (options, callback) {
  options = _.clone(options); // we'll be modifying options

  if (!options.password)
    throw new Error("Must set options.password");

  // Replace password with the hashed password.
  options.password = hashPassword(options.password);

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
    [oldPassword ? hashPassword(oldPassword) : null, hashPassword(newPassword)],
    function (error, result) {
      if (error || !result) {
        if (error && error.error === 400 &&
            error.reason === 'old password format') {
          // XXX COMPAT WITH 0.8.1.3
          // The server is telling us to upgrade from SRP to bcrypt, as
          // in Meteor.loginWithPassword.
          srpUpgradePath({
            upgradeError: error,
            userSelector: { id: Meteor.userId() },
            plaintextPassword: oldPassword
          }, function (err) {
            if (err) {
              callback(err);
            } else {
              // Now that we've successfully migrated from srp to
              // bcrypt, try changing the password again.
              Accounts.changePassword(oldPassword, newPassword, callback);
            }
          });
        } else {
          // A normal error, not an error telling us to upgrade to bcrypt
          callback && callback(
            error || new Error("No result from changePassword."));
        }
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
    methodArguments: [token, hashPassword(newPassword)],
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

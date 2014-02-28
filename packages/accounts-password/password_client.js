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
  var srp = new SRP.Client(password);
  var request = srp.startExchange();

  if (typeof selector === 'string')
    if (selector.indexOf('@') === -1)
      selector = {username: selector};
    else
      selector = {email: selector};

  request.user = selector;

  // Normally, we only set Meteor.loggingIn() to true within
  // Accounts.callLoginMethod, but we'd also like it to be true during the
  // password exchange. So we set it to true here, and clear it on error; in
  // the non-error case, it gets cleared by callLoginMethod.
  Accounts._setLoggingIn(true);
  Accounts.connection.apply(
    'beginPasswordExchange', [request], function (error, result) {
      if (error || !result) {
        Accounts._setLoggingIn(false);
        error = error ||
          new Error("No result from call to beginPasswordExchange");
        callback && callback(error);
        return;
      }

      var response = srp.respondToChallenge(result);
      Accounts.callLoginMethod({
        methodArguments: [{srp: response}],
        validateResult: function (result) {
          if (!srp.verifyConfirmation({HAMK: result.HAMK}))
            throw new Error("Server is cheating!");
        },
        userCallback: callback});
    });
};


// Attempt to log in as a new user.
Accounts.createUser = function (options, callback) {
  options = _.clone(options); // we'll be modifying options

  if (!options.password)
    throw new Error("Must set options.password");
  var verifier = SRP.generateVerifier(options.password);
  // strip old password, replacing with the verifier object
  delete options.password;
  options.srp = verifier;

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

  var verifier = SRP.generateVerifier(newPassword);

  if (!oldPassword) {
    Accounts.connection.apply(
      'changePassword', [{srp: verifier}], function (error, result) {
        if (error || !result) {
          callback && callback(
            error || new Error("No result from changePassword."));
        } else {
          callback && callback();
        }
      });
  } else { // oldPassword
    var srp = new SRP.Client(oldPassword);
    var request = srp.startExchange();
    request.user = {id: Meteor.user()._id};
    Accounts.connection.apply(
      'beginPasswordExchange', [request], function (error, result) {
        if (error || !result) {
          callback && callback(
            error || new Error("No result from call to beginPasswordExchange"));
          return;
        }

        var response = srp.respondToChallenge(result);
        response.srp = verifier;
        Accounts.connection.apply(
          'changePassword', [response],function (error, result) {
            if (error || !result) {
              callback && callback(
                error || new Error("No result from changePassword."));
            } else {
              if (!srp.verifyConfirmation(result)) {
                // Monkey business!
                callback &&
                  callback(new Error("Old password verification failed."));
              } else {
                callback && callback();
              }
            }
          });
      });
  }
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

  var verifier = SRP.generateVerifier(newPassword);
  Accounts.callLoginMethod({
    methodName: 'resetPassword',
    methodArguments: [token, verifier],
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

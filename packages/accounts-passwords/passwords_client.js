(function () {

  // XXX options to add to new user
  // XXX callback
  Meteor.loginNewUser = function (username, email, password, callback) {
    var verifier = Meteor._srp.generateVerifier(password);

    Meteor.apply('login', [
      {newUser: {username: username, email: email, verifier: verifier}}
    ], {wait: true}, function (error, result) {
      if (error || !result) {
        error = error || new Error("No result");
        callback && callback(error);
        return;
      }

      Meteor.accounts.makeClientLoggedIn(result.id, result.token);
      callback && callback(undefined, {message: 'Success'});
    });

  };

  // @param selector {String|Object} One of the following:
  //   - {username: (username)}
  //   - {email: (email)}
  //   - a string which may be a username or email, depending on whether
  //     it contains "@".
  // @param password {String}
  // @param callback {Function(error|undefined)}
  Meteor.loginWithPassword = function (selector, password, callback) {
    var srp = new Meteor._srp.Client(password);
    var request = srp.startExchange();

    if (typeof selector === 'string')
      if (selector.indexOf('@') === -1)
        selector = {username: selector};
      else
        selector = {email: selector};

    request.user = selector;

    Meteor.apply('beginPasswordExchange', [request], function (error, result) {
      if (error || !result) {
        error = error || new Error("No result from call to beginPasswordExchange");
        callback && callback(error);
        return;
      }

      var response = srp.respondToChallenge(result);
      Meteor.apply('login', [
        {srp: response}
      ], {wait: true}, function (error, result) {
        if (error || !result) {
          error = error || new Error("No result from call to login");
          callback && callback(error);
          return;
        }

        if (!srp.verifyConfirmation({HAMK: result.HAMK})) {
          callback && callback(new Error("Server is cheating!"));
          return;
        }

        Meteor.accounts.makeClientLoggedIn(result.id, result.token);
        callback && callback();
      });
    });
  };


  // @param oldPassword {String|null}
  // @param newPassword {String}
  // @param callback {Function(error|undefined)}
  Meteor.changePassword = function (oldPassword, newPassword, callback) {
    if (!Meteor.user()) {
      callback && callback(new Error("Must be logged in to change password."));
      return;
    }

    var verifier = Meteor._srp.generateVerifier(newPassword);

    if (!oldPassword) {
      Meteor.apply('changePassword', [{srp: verifier}], function (error, result) {
        if (error || !result) {
          callback && callback(
            error || new Error("No result from changePassword."));
        } else {
          callback();
        }
      });
    } else { // oldPassword
      var srp = new Meteor._srp.Client(oldPassword);
      var request = srp.startExchange();
      request.user = {id: Meteor.user()._id};
      Meteor.apply('beginPasswordExchange', [request], function (error, result) {
        if (error || !result) {
          callback && callback(
            error || new Error("No result from call to beginPasswordExchange"));
          return;
        }

        var response = srp.respondToChallenge(result);
        response.srp = verifier;
        Meteor.apply('changePassword', [response], function (error, result) {
          if (error || !result) {
            callback && callback(
              error || new Error("No result from changePassword."));
          } else {
            if (!srp.verifyConfirmation(result)) {
              // Monkey business!
              callback(new Error("Old password verification failed."));
            } else {
              callback();
            }
          }
        });
      });
    }
  };
})();

///
/// LOGIN
///

// Users can specify various keys to identify themselves with.
// @param user {Object} with one of `id`, `username`, or `email`.
// @returns A selector to pass to mongo to get the user record.

var selectorFromUserQuery = function (user) {
  if (user.id)
    return {_id: user.id};
  else if (user.username)
    return {username: user.username};
  else if (user.email)
    return {"emails.address": user.email};
  throw new Error("shouldn't happen (validation missed something)");
};

// XXX maybe this belongs in the check package
var NonEmptyString = Match.Where(function (x) {
  check(x, String);
  return x.length > 0;
});

var userQueryValidator = Match.Where(function (user) {
  check(user, {
    id: Match.Optional(NonEmptyString),
    username: Match.Optional(NonEmptyString),
    email: Match.Optional(NonEmptyString)
  });
  if (_.keys(user).length !== 1)
    throw new Match.Error("User property must have exactly one field");
  return true;
});

// Step 1 of SRP password exchange. This puts an `M` value in the
// session data for this connection. If a client later sends the same
// `M` value to a method on this connection, it proves they know the
// password for this user. We can then prove we know the password to
// them by sending our `HAMK` value.
//
// @param request {Object} with fields:
//   user: either {username: (username)}, {email: (email)}, or {id: (userId)}
//   A: hex encoded int. the client's public key for this exchange
// @returns {Object} with fields:
//   identity: random string ID
//   salt: random string ID
//   B: hex encoded int. server's public key for this exchange
Meteor.methods({beginPasswordExchange: function (request) {
  var self = this;
  try {
    check(request, {
      user: userQueryValidator,
      A: String
    });
    var selector = selectorFromUserQuery(request.user);

    var user = Meteor.users.findOne(selector);
    if (!user)
      throw new Meteor.Error(403, "User not found");

    if (!user.services || !user.services.password ||
        !user.services.password.srp)
      throw new Meteor.Error(403, "User has no password set");

    var verifier = user.services.password.srp;
    var srp = new SRP.Server(verifier);
    var challenge = srp.issueChallenge({A: request.A});

  } catch (err) {
    // Report login failure if the method fails, so that login hooks are
    // called. If the method succeeds, login hooks will be called when
    // the second step method ('login') is called. If a user calls
    // 'beginPasswordExchange' but then never calls the second step
    // 'login' method, no login hook will fire.
    Accounts._reportLoginFailure(self, 'beginPasswordExchange', arguments, {
      type: 'password',
      error: err,
      userId: user && user._id
    });
    throw err;
  }

  // Save results so we can verify them later.
  Accounts._setAccountData(this.connection.id, 'srpChallenge',
    { userId: user._id, M: srp.M, HAMK: srp.HAMK }
  );
  return challenge;
}});

// Handler to login with password via SRP. Checks the `M` value set by
// beginPasswordExchange.
Accounts.registerLoginHandler("password", function (options) {
  if (!options.srp)
    return undefined; // don't handle
  check(options.srp, {M: String});

  // we're always called from within a 'login' method, so this should
  // be safe.
  var currentInvocation = DDP._CurrentInvocation.get();
  var serialized = Accounts._getAccountData(currentInvocation.connection.id, 'srpChallenge');
  if (!serialized || serialized.M !== options.srp.M)
    return {
      userId: serialized && serialized.userId,
      error: new Meteor.Error(403, "Incorrect password")
    };
  // Only can use challenges once.
  Accounts._setAccountData(currentInvocation.connection.id, 'srpChallenge', undefined);

  var userId = serialized.userId;
  var user = Meteor.users.findOne(userId);
  // Was the user deleted since the start of this challenge?
  if (!user)
    return {
      userId: userId,
      error: new Meteor.Error(403, "User not found")
    };

  return {
    userId: userId,
    options: {HAMK: serialized.HAMK}
  };
});

// Handler to login with plaintext password.
//
// The meteor client doesn't use this, it is for other DDP clients who
// haven't implemented SRP. Since it sends the password in plaintext
// over the wire, it should only be run over SSL!
//
// Also, it might be nice if servers could turn this off. Or maybe it
// should be opt-in, not opt-out? Accounts.config option?
Accounts.registerLoginHandler("password", function (options) {
  if (!options.password || !options.user)
    return undefined; // don't handle

  check(options, {user: userQueryValidator, password: String});

  var selector = selectorFromUserQuery(options.user);
  var user = Meteor.users.findOne(selector);
  if (!user)
    throw new Meteor.Error(403, "User not found");

  if (!user.services || !user.services.password ||
      !user.services.password.srp)
    return {
      userId: user._id,
      error: new Meteor.Error(403, "User has no password set")
    };

  // Just check the verifier output when the same identity and salt
  // are passed. Don't bother with a full exchange.
  var verifier = user.services.password.srp;
  var newVerifier = SRP.generateVerifier(options.password, {
    identity: verifier.identity, salt: verifier.salt});

  if (verifier.verifier !== newVerifier.verifier)
    return {
      userId: user._id,
      error: new Meteor.Error(403, "Incorrect password")
    };

  return {userId: user._id};
});


///
/// CHANGING
///

// Let the user change their own password if they know the old
// password. Checks the `M` value set by beginPasswordExchange.
Meteor.methods({changePassword: function (options) {
  if (!this.userId)
    throw new Meteor.Error(401, "Must be logged in");
  check(options, {
    // If options.M is set, it means we went through a challenge with the old
    // password. For now, we don't allow changePassword without knowing the old
    // password.
    M: String,
    srp: Match.Optional(SRP.matchVerifier),
    password: Match.Optional(String)
  });

  var serialized = Accounts._getAccountData(this.connection.id, 'srpChallenge');
  if (!serialized || serialized.M !== options.M)
    throw new Meteor.Error(403, "Incorrect password");
  if (serialized.userId !== this.userId)
    // No monkey business!
    throw new Meteor.Error(403, "Incorrect password");
  // Only can use challenges once.
  Accounts._setAccountData(this.connection.id, 'srpChallenge', undefined);

  var verifier = options.srp;
  if (!verifier && options.password) {
    verifier = SRP.generateVerifier(options.password);
  }
  if (!verifier)
    throw new Meteor.Error(400, "Invalid verifier");

  // XXX this should invalidate all login tokens other than the current one
  // (or it should assign a new login token, replacing existing ones)
  Meteor.users.update({_id: this.userId},
                      {$set: {'services.password.srp': verifier}});

  var ret = {passwordChanged: true};
  if (serialized)
    ret.HAMK = serialized.HAMK;
  return ret;
}});


// Force change the users password.
Accounts.setPassword = function (userId, newPassword) {
  var user = Meteor.users.findOne(userId);
  if (!user)
    throw new Meteor.Error(403, "User not found");
  var newVerifier = SRP.generateVerifier(newPassword);

  Meteor.users.update({_id: user._id}, {
    $set: {'services.password.srp': newVerifier}});
};


///
/// RESETTING VIA EMAIL
///

// Method called by a user to request a password reset email. This is
// the start of the reset process.
Meteor.methods({forgotPassword: function (options) {
  check(options, {email: String});

  var user = Meteor.users.findOne({"emails.address": options.email});
  if (!user)
    throw new Meteor.Error(403, "User not found");

  Accounts.sendResetPasswordEmail(user._id, options.email);
}});

// send the user an email with a link that when opened allows the user
// to set a new password, without the old password.
//
Accounts.sendResetPasswordEmail = function (userId, email) {
  // Make sure the user exists, and email is one of their addresses.
  var user = Meteor.users.findOne(userId);
  if (!user)
    throw new Error("Can't find user");
  // pick the first email if we weren't passed an email.
  if (!email && user.emails && user.emails[0])
    email = user.emails[0].address;
  // make sure we have a valid email
  if (!email || !_.contains(_.pluck(user.emails || [], 'address'), email))
    throw new Error("No such email for user.");

  var token = Random.id();
  var when = new Date();
  Meteor.users.update(userId, {$set: {
    "services.password.reset": {
      token: token,
      email: email,
      when: when
    }
  }});

  var resetPasswordUrl = Accounts.urls.resetPassword(token);

  var options = {
    to: email,
    from: Accounts.emailTemplates.from,
    subject: Accounts.emailTemplates.resetPassword.subject(user),
    text: Accounts.emailTemplates.resetPassword.text(user, resetPasswordUrl)
  };

  if (typeof Accounts.emailTemplates.resetPassword.html === 'function')
    options.html =
      Accounts.emailTemplates.resetPassword.html(user, resetPasswordUrl);

  Email.send(options);
};

// send the user an email informing them that their account was created, with
// a link that when opened both marks their email as verified and forces them
// to choose their password. The email must be one of the addresses in the
// user's emails field, or undefined to pick the first email automatically.
//
// This is not called automatically. It must be called manually if you
// want to use enrollment emails.
//
Accounts.sendEnrollmentEmail = function (userId, email) {
  // XXX refactor! This is basically identical to sendResetPasswordEmail.

  // Make sure the user exists, and email is in their addresses.
  var user = Meteor.users.findOne(userId);
  if (!user)
    throw new Error("Can't find user");
  // pick the first email if we weren't passed an email.
  if (!email && user.emails && user.emails[0])
    email = user.emails[0].address;
  // make sure we have a valid email
  if (!email || !_.contains(_.pluck(user.emails || [], 'address'), email))
    throw new Error("No such email for user.");


  var token = Random.id();
  var when = new Date();
  Meteor.users.update(userId, {$set: {
    "services.password.reset": {
      token: token,
      email: email,
      when: when
    }
  }});

  var enrollAccountUrl = Accounts.urls.enrollAccount(token);
  
  var options = {
    to: email,
    from: Accounts.emailTemplates.from,
    subject: Accounts.emailTemplates.enrollAccount.subject(user),
    text: Accounts.emailTemplates.enrollAccount.text(user, enrollAccountUrl)
  };
  
  if (typeof Accounts.emailTemplates.enrollAccount.html === 'function')
    options.html =
      Accounts.emailTemplates.enrollAccount.html(user, enrollAccountUrl);

  Email.send(options);
};


// Take token from sendResetPasswordEmail or sendEnrollmentEmail, change
// the users password, and log them in.
Meteor.methods({resetPassword: function (token, newVerifier) {
  var self = this;
  return Accounts._loginMethod(
    self,
    "resetPassword",
    arguments,
    "password",
    function () {
      check(token, String);
      check(newVerifier, SRP.matchVerifier);

      var user = Meteor.users.findOne({
        "services.password.reset.token": ""+token});
      if (!user)
        throw new Meteor.Error(403, "Token expired");
      var email = user.services.password.reset.email;
      if (!_.include(_.pluck(user.emails || [], 'address'), email))
        return {
          userId: user._id,
          error: new Meteor.Error(403, "Token has invalid email address")
        };

      // NOTE: We're about to invalidate tokens on the user, who we might be
      // logged in as. Make sure to avoid logging ourselves out if this
      // happens. But also make sure not to leave the connection in a state
      // of having a bad token set if things fail.
      var oldToken = Accounts._getLoginToken(self.connection.id);
      Accounts._setLoginToken(user._id, self.connection, null);
      var resetToOldToken = function () {
        Accounts._setLoginToken(user._id, self.connection, oldToken);
      };

      try {
        // Update the user record by:
        // - Changing the password verifier to the new one
        // - Forgetting about the reset token that was just used
        // - Verifying their email, since they got the password reset via email.
        var affectedRecords = Meteor.users.update(
          {
            _id: user._id,
            'emails.address': email,
            'services.password.reset.token': token
          },
          {$set: {'services.password.srp': newVerifier,
                  'emails.$.verified': true},
           $unset: {'services.password.reset': 1}});
        if (affectedRecords !== 1)
          return {
            userId: user._id,
            error: new Meteor.Error(403, "Invalid email")
          };
      } catch (err) {
        resetToOldToken();
        throw err;
      }

      // Replace all valid login tokens with new ones (changing
      // password should invalidate existing sessions).
      Accounts._clearAllLoginTokens(user._id);

      return {userId: user._id};
    }
  );
}});

///
/// EMAIL VERIFICATION
///


// send the user an email with a link that when opened marks that
// address as verified
//
Accounts.sendVerificationEmail = function (userId, address) {
  // XXX Also generate a link using which someone can delete this
  // account if they own said address but weren't those who created
  // this account.

  // Make sure the user exists, and address is one of their addresses.
  var user = Meteor.users.findOne(userId);
  if (!user)
    throw new Error("Can't find user");
  // pick the first unverified address if we weren't passed an address.
  if (!address) {
    var email = _.find(user.emails || [],
                       function (e) { return !e.verified; });
    address = (email || {}).address;
  }
  // make sure we have a valid address
  if (!address || !_.contains(_.pluck(user.emails || [], 'address'), address))
    throw new Error("No such email address for user.");


  var tokenRecord = {
    token: Random.id(),
    address: address,
    when: new Date()};
  Meteor.users.update(
    {_id: userId},
    {$push: {'services.email.verificationTokens': tokenRecord}});

  var verifyEmailUrl = Accounts.urls.verifyEmail(tokenRecord.token);
  
  var options = {
    to: address,
    from: Accounts.emailTemplates.from,
    subject: Accounts.emailTemplates.verifyEmail.subject(user),
    text: Accounts.emailTemplates.verifyEmail.text(user, verifyEmailUrl)
  };
  
  if (typeof Accounts.emailTemplates.verifyEmail.html === 'function')
    options.html =
      Accounts.emailTemplates.verifyEmail.html(user, verifyEmailUrl);

  Email.send(options);
};

// Take token from sendVerificationEmail, mark the email as verified,
// and log them in.
Meteor.methods({verifyEmail: function (token) {
  var self = this;
  return Accounts._loginMethod(
    self,
    "verifyEmail",
    arguments,
    "password",
    function () {
      check(token, String);

      var user = Meteor.users.findOne(
        {'services.email.verificationTokens.token': token});
      if (!user)
        throw new Meteor.Error(403, "Verify email link expired");

      var tokenRecord = _.find(user.services.email.verificationTokens,
                               function (t) {
                                 return t.token == token;
                               });
      if (!tokenRecord)
        return {
          userId: user._id,
          error: new Meteor.Error(403, "Verify email link expired")
        };

      var emailsRecord = _.find(user.emails, function (e) {
        return e.address == tokenRecord.address;
      });
      if (!emailsRecord)
        return {
          userId: user._id,
          error: new Meteor.Error(403, "Verify email link is for unknown address")
        };

      // By including the address in the query, we can use 'emails.$' in the
      // modifier to get a reference to the specific object in the emails
      // array. See
      // http://www.mongodb.org/display/DOCS/Updating/#Updating-The%24positionaloperator)
      // http://www.mongodb.org/display/DOCS/Updating#Updating-%24pull
      Meteor.users.update(
        {_id: user._id,
         'emails.address': tokenRecord.address},
        {$set: {'emails.$.verified': true},
         $pull: {'services.email.verificationTokens': {token: token}}});

      return {userId: user._id};
    }
  );
}});



///
/// CREATING USERS
///

// Shared createUser function called from the createUser method, both
// if originates in client or server code. Calls user provided hooks,
// does the actual user insertion.
//
// returns the user id
var createUser = function (options) {
  // Unknown keys allowed, because a onCreateUserHook can take arbitrary
  // options.
  check(options, Match.ObjectIncluding({
    username: Match.Optional(String),
    email: Match.Optional(String),
    password: Match.Optional(String),
    srp: Match.Optional(SRP.matchVerifier)
  }));

  var username = options.username;
  var email = options.email;
  if (!username && !email)
    throw new Meteor.Error(400, "Need to set a username or email");

  // Raw password. The meteor client doesn't send this, but a DDP
  // client that didn't implement SRP could send this. This should
  // only be done over SSL.
  if (options.password) {
    if (options.srp)
      throw new Meteor.Error(400, "Don't pass both password and srp in options");
    options.srp = SRP.generateVerifier(options.password);
  }

  var user = {services: {}};
  if (options.srp)
    user.services.password = {srp: options.srp}; // XXX validate verifier
  if (username)
    user.username = username;
  if (email)
    user.emails = [{address: email, verified: false}];

  return Accounts.insertUserDoc(options, user);
};

// method for create user. Requests come from the client.
Meteor.methods({createUser: function (options) {
  var self = this;
  return Accounts._loginMethod(
    self,
    "createUser",
    arguments,
    "password",
    function () {
      // createUser() above does more checking.
      check(options, Object);
      if (Accounts._options.forbidClientAccountCreation)
        return {
          error: new Meteor.Error(403, "Signups forbidden")
        };

      // Create user. result contains id and token.
      var userId = createUser(options);
      // safety belt. createUser is supposed to throw on error. send 500 error
      // instead of sending a verification email with empty userid.
      if (! userId)
        throw new Error("createUser failed to insert new user");

      // If `Accounts._options.sendVerificationEmail` is set, register
      // a token to verify the user's primary email, and send it to
      // that address.
      if (options.email && Accounts._options.sendVerificationEmail)
        Accounts.sendVerificationEmail(userId, options.email);

      // client gets logged in as the new user afterwards.
      return {userId: userId};
    }
  );
}});

// Create user directly on the server.
//
// Unlike the client version, this does not log you in as this user
// after creation.
//
// returns userId or throws an error if it can't create
//
// XXX add another argument ("server options") that gets sent to onCreateUser,
// which is always empty when called from the createUser method? eg, "admin:
// true", which we want to prevent the client from setting, but which a custom
// method calling Accounts.createUser could set?
//
Accounts.createUser = function (options, callback) {
  options = _.clone(options);

  // XXX allow an optional callback?
  if (callback) {
    throw new Error("Accounts.createUser with callback not supported on the server yet.");
  }

  return createUser(options);
};

///
/// PASSWORD-SPECIFIC INDEXES ON USERS
///
Meteor.users._ensureIndex('emails.validationTokens.token',
                          {unique: 1, sparse: 1});
Meteor.users._ensureIndex('services.password.reset.token',
                          {unique: 1, sparse: 1});

/// BCRYPT

var bcrypt = Npm.require('bcrypt');
var bcryptHash = Meteor._wrapAsync(bcrypt.hash);
var bcryptCompare = Meteor._wrapAsync(bcrypt.compare);

// Salt the password that was hashed on the client for storage in the
// database.
//
var saltPassword = function (hashedPassword) {
  return bcryptHash(hashedPassword, 10);
};


// Check whether the provided hashed password matches the salted
// password in the database user record.
//
var checkPassword = function (user, hashedPassword) {
  var result = {
    userId: user._id
  };

  if (! bcryptCompare(hashedPassword, user.services.password.bcrypt))
    result.error = new Meteor.Error(403, "Incorrect password");

  return result;
};


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

var findUserFromUserQuery = function (user) {
  var selector = selectorFromUserQuery(user);

  var user = Meteor.users.findOne(selector);
  if (!user)
    throw new Meteor.Error(403, "User not found");

  return user;
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

// Handler to login with a password.
Accounts.registerLoginHandler("password", function (options) {
  if (!options.hashedPassword || options.srp)
    return undefined; // don't handle

  check(options, {
    user: userQueryValidator,
    hashedPassword: String
  });

  var user = findUserFromUserQuery(options.user);

  if (!user.services || !user.services.password ||
      !(user.services.password.bcrypt || user.services.password.srp))
    throw new Meteor.Error(403, "User has no password set");

  if (!user.services.password.bcrypt) {
    // Tell the client to use the SRP upgrade process.
    throw new Meteor.Error(400, "old password format", EJSON.stringify({
      format: 'srp',
      identity: user.services.password.srp.identity
    }));
  }

  return checkPassword(user, options.hashedPassword);
});

// Handler to login using the SRP upgrade path.
Accounts.registerLoginHandler("password", function (options) {
  if (!options.srp || !options.hashedPassword)
    return undefined; // don't handle

  check(options, {
    user: userQueryValidator,
    srp: String,
    hashedPassword: String
  });

  var user = findUserFromUserQuery(options.user);

  if (!(user.services && user.services.password && user.services.password.srp))
    throw new Meteor.Error(403, "User has no password set");

  var v1 = user.services.password.srp.verifier;
  var v2 = SRP.generateVerifier(
    null,
    {
      hashedIdentityAndPassword: options.srp,
      salt: user.services.password.srp.salt
    }
  ).verifier;
  if (v1 !== v2)
    return {
      userId: user._id,
      error: new Meteor.Error(403, "Incorrect password")
    };

  // Upgrade to bcrypt on successful login.
  var salted = saltPassword(options.hashedPassword);
  Meteor.users.update(
    user._id,
    {
      $unset: { 'services.password.srp': 1 },
      $set: { 'services.password.bcrypt': salted }
    }
  );

  return {userId: user._id};
});

// Handler to login with plaintext password.
//
// The meteor client doesn't use this, it is for other DDP clients who
// haven't implemented hashing passwords. Since it sends the password
// in plaintext over the wire, it should only be run over SSL!
//
// XXX The above comment suggests regular logins without SSL *are*
// secure?
//
// Also, it might be nice if servers could turn this off. Or maybe it
// should be opt-in, not opt-out? Accounts.config option?
Accounts.registerLoginHandler("password", function (options) {
  if (!options.password || !options.user)
    return undefined; // don't handle

  check(options, {user: userQueryValidator, password: String});

  var user = findUserFromUserQuery(options.user);

  if (!user.services || !user.services.password || !user.services.password.bcrypt)
    return {
      userId: user._id,
      error: new Meteor.Error(403, "User has no password set")
    };

  return checkPassword(user, SHA256(options.password))
});


///
/// CHANGING
///

// Let the user change their own password if they know the old
// password.
Meteor.methods({changePassword: function (oldPassword, newPassword) {
  check(oldPassword, String);
  check(newPassword, String);

  if (!this.userId)
    throw new Meteor.Error(401, "Must be logged in");

  var user = Meteor.users.findOne(this.userId);
  if (!user)
    throw new Meteor.Error(403, "User not found");

  if (!user.services || !user.services.password || !user.services.password.bcrypt)
    throw new Meteor.Error(403, "User has no password set");

  var result = checkPassword(user, oldPassword);
  if (result.error)
    throw result.error;

  var salted = saltPassword(newPassword);

  // It would be better if this removed ALL existing tokens and replaced
  // the token for the current connection with a new one, but that would
  // be tricky, so we'll settle for just replacing all tokens other than
  // the one for the current connection.
  var currentToken = Accounts._getLoginToken(this.connection.id);
  Meteor.users.update(
    { _id: this.userId },
    {
      $set: { 'services.password.bcrypt': salted },
      $pull: {
        'services.resume.loginTokens': { hashedToken: { $ne: currentToken } }
      }
    }
  );

  return {passwordChanged: true};
}});


// Force change the users password.
Accounts.setPassword = function (userId, newPassword) {
  var user = Meteor.users.findOne(userId);
  if (!user)
    throw new Meteor.Error(403, "User not found");

  Meteor.users.update(
    {_id: user._id},
    { $unset: {'services.password.srp': 1},
      $set: {'services.password.bcrypt': saltPassword(SHA256(newPassword))} }
  );
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

  var token = Random.secret();
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


  var token = Random.secret();
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
Meteor.methods({resetPassword: function (token, newPassword) {
  var self = this;
  return Accounts._loginMethod(
    self,
    "resetPassword",
    arguments,
    "password",
    function () {
      check(token, String);
      check(newPassword, String);

      var user = Meteor.users.findOne({
        "services.password.reset.token": token});
      if (!user)
        throw new Meteor.Error(403, "Token expired");
      var email = user.services.password.reset.email;
      if (!_.include(_.pluck(user.emails || [], 'address'), email))
        return {
          userId: user._id,
          error: new Meteor.Error(403, "Token has invalid email address")
        };

      var salted = saltPassword(newPassword);

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
        // - Changing the password to the new one
        // - Forgetting about the reset token that was just used
        // - Verifying their email, since they got the password reset via email.
        var affectedRecords = Meteor.users.update(
          {
            _id: user._id,
            'emails.address': email,
            'services.password.reset.token': token
          },
          {$set: {'services.password.bcrypt': salted,
                  'emails.$.verified': true},
           $unset: {'services.password.reset': 1,
                    'services.password.srp': 1}});
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
    token: Random.secret(),
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
    srp: Match.Optional(SRP.matchVerifier),
    hashedPassword: Match.Optional(String)
  }));

  var username = options.username;
  var email = options.email;
  if (!username && !email)
    throw new Meteor.Error(400, "Need to set a username or email");

  // Raw password. The meteor client doesn't send this, but a DDP
  // client that didn't implement SRP could send this. This should
  // only be done over SSL.
  if (options.password) {
    if (options.hashedPassword)
      throw new Meteor.Error(400, "Don't pass both password and hashedPassword in options");
    options.hashedPassword = SHA256(options.password);
  }

  var user = {services: {}};
  if (options.hashedPassword) {
    var salted = saltPassword(options.hashedPassword);
    user.services.password = { bcrypt: salted };
  }
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

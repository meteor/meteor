///
/// LOGIN
///

// Users can specify various keys to identify themselves with.
// @param user {Object} with one of `id`, `username`, or `email`.
// @returns A selector to pass to mongo to get the user record.
var selectorFromUserQuery = function (user) {
  if (!user)
    throw new Meteor.Error(400, "Er moet een user eigenschap doorgegeven worden in de request.");
  if (_.keys(user).length !== 1)
    throw new Meteor.Error(400, "Gebruiker eigenschap moet precies een veld hebben.");

  var selector;
  if (user.id)
    selector = {_id: user.id};
  else if (user.username)
    selector = {username: user.username};
  else if (user.email)
    selector = {"emails.address": user.email};
  else
    throw new Meteor.Error(400, "Gebruikersnaam, email of id moet doorgegeven worden in request.user");

  return selector;
};

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
  var selector = selectorFromUserQuery(request.user);

  var user = Meteor.users.findOne(selector);
  if (!user)
    throw new Meteor.Error(403, "Gebruiker niet gevonden.");

  if (!user.services || !user.services.password ||
      !user.services.password.srp)
    throw new Meteor.Error(403, "Gebruiker heeft geen wachtwoord gezet.");

  var verifier = user.services.password.srp;
  var srp = new Meteor._srp.Server(verifier);
  var challenge = srp.issueChallenge({A: request.A});

  // save off results in the current session so we can verify them
  // later.
  this._sessionData.srpChallenge =
    { userId: user._id, M: srp.M, HAMK: srp.HAMK };

  return challenge;
}});

// Handler to login with password via SRP. Checks the `M` value set by
// beginPasswordExchange.
Accounts.registerLoginHandler(function (options) {
  if (!options.srp)
    return undefined; // don't handle
  if (!options.srp.M)
    throw new Meteor.Error(400, "Er moet een M doorgegeven worden in options.srp");

  // we're always called from within a 'login' method, so this should
  // be safe.
  var currentInvocation = Meteor._CurrentInvocation.get();
  var serialized = currentInvocation._sessionData.srpChallenge;
  if (!serialized || serialized.M !== options.srp.M)
    throw new Meteor.Error(403, "Onjuist wachtwoord.");
  // Only can use challenges once.
  delete currentInvocation._sessionData.srpChallenge;

  var userId = serialized.userId;
  var user = Meteor.users.findOne(userId);
  // Was the user deleted since the start of this challenge?
  if (!user)
    throw new Meteor.Error(403, "Gebruiker niet gevonden.");
  var stampedLoginToken = Accounts._generateStampedLoginToken();
  Meteor.users.update(
    userId, {$push: {'services.resume.loginTokens': stampedLoginToken}});

  return {token: stampedLoginToken.token, id: userId, HAMK: serialized.HAMK};
});

// Handler to login with plaintext password.
//
// The meteor client doesn't use this, it is for other DDP clients who
// haven't implemented SRP. Since it sends the password in plaintext
// over the wire, it should only be run over SSL!
//
// Also, it might be nice if servers could turn this off. Or maybe it
// should be opt-in, not opt-out? Accounts.config option?
Accounts.registerLoginHandler(function (options) {
  if (!options.password || !options.user)
    return undefined; // don't handle

  var selector = selectorFromUserQuery(options.user);
  var user = Meteor.users.findOne(selector);
  if (!user)
    throw new Meteor.Error(403, "Gebruiker niet gevonden.");

  if (!user.services || !user.services.password ||
      !user.services.password.srp)
    throw new Meteor.Error(403, "Gebruiker heeft geen wachtwoord gezet.");

  // Just check the verifier output when the same identity and salt
  // are passed. Don't bother with a full exchange.
  var verifier = user.services.password.srp;
  var newVerifier = Meteor._srp.generateVerifier(options.password, {
    identity: verifier.identity, salt: verifier.salt});

  if (verifier.verifier !== newVerifier.verifier)
    throw new Meteor.Error(403, "Onjuist wachtwoord.");

  var stampedLoginToken = Accounts._generateStampedLoginToken();
  Meteor.users.update(
    user._id, {$push: {'services.resume.loginTokens': stampedLoginToken}});

  return {token: stampedLoginToken.token, id: user._id};
});


///
/// CHANGING
///

// Let the user change their own password if they know the old
// password. Checks the `M` value set by beginPasswordExchange.
Meteor.methods({changePassword: function (options) {
  if (!this.userId)
    throw new Meteor.Error(401, "Moet ingelogd zijn.");

  // If options.M is set, it means we went through a challenge with
  // the old password.

  if (!options.M /* could allow unsafe password changes here */) {
    throw new Meteor.Error(403, "Oud wachtwoord vereist.");
  }

  if (options.M) {
    var serialized = this._sessionData.srpChallenge;
    if (!serialized || serialized.M !== options.M)
      throw new Meteor.Error(403, "Onjuist wachtwoord.");
    if (serialized.userId !== this.userId)
      // No monkey business!
      throw new Meteor.Error(403, "Onjuist wachtwoord.");
    // Only can use challenges once.
    delete this._sessionData.srpChallenge;
  }

  var verifier = options.srp;
  if (!verifier && options.password) {
    verifier = Meteor._srp.generateVerifier(options.password);
  }
  if (!verifier || !verifier.identity || !verifier.salt ||
      !verifier.verifier)
    throw new Meteor.Error(400, "Onjuiste controle sleutel");

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
    throw new Meteor.Error(403, "Gebruiker niet gevonden.");
  var newVerifier = Meteor._srp.generateVerifier(newPassword);

  Meteor.users.update({_id: user._id}, {
    $set: {'services.password.srp': newVerifier}});
};


///
/// RESETTING VIA EMAIL
///

// Method called by a user to request a password reset email. This is
// the start of the reset process.
Meteor.methods({forgotPassword: function (options) {
  var email = options.email;
  if (!email)
    throw new Meteor.Error(400, "options.email moet gezet worden.");

  var user = Meteor.users.findOne({"emails.address": email});
  if (!user)
    throw new Meteor.Error(403, "Gebruiker niet gevonden.");

  Accounts.sendResetPasswordEmail(user._id, email);
}});

// send the user an email with a link that when opened allows the user
// to set a new password, without the old password.
Accounts.sendResetPasswordEmail = function (userId, email) {
  // Make sure the user exists, and email is one of their addresses.
  var user = Meteor.users.findOne(userId);
  if (!user)
    throw new Error("Kan de gebruiker niet vinden.");
  // pick the first email if we weren't passed an email.
  if (!email && user.emails && user.emails[0])
    email = user.emails[0].address;
  // make sure we have a valid email
  if (!email || !_.contains(_.pluck(user.emails || [], 'address'), email))
    throw new Error("Niet bestaand email adres voor gebruiker.");

  var token = Random.id();
  var when = +(new Date);
  Meteor.users.update(userId, {$set: {
    "services.password.reset": {
      token: token,
      email: email,
      when: when
    }
  }});

  var resetPasswordUrl = Accounts.urls.resetPassword(token);
  Email.send({
    to: email,
    from: Accounts.emailTemplates.from,
    subject: Accounts.emailTemplates.resetPassword.subject(user),
    text: Accounts.emailTemplates.resetPassword.text(user, resetPasswordUrl)});
};

// send the user an email informing them that their account was created, with
// a link that when opened both marks their email as verified and forces them
// to choose their password. The email must be one of the addresses in the
// user's emails field, or undefined to pick the first email automatically.
//
// This is not called automatically, it must be called manually if you
// want to use enrollment emails.
Accounts.sendEnrollmentEmail = function (userId, email) {
  // XXX refactor! This is basically identical to sendResetPasswordEmail.

  // Make sure the user exists, and email is in their addresses.
  var user = Meteor.users.findOne(userId);
  if (!user)
    throw new Error("Kan de gebruiker niet vinden.");
  // pick the first email if we weren't passed an email.
  if (!email && user.emails && user.emails[0])
    email = user.emails[0].address;
  // make sure we have a valid email
  if (!email || !_.contains(_.pluck(user.emails || [], 'address'), email))
    throw new Error("Niet bestaand email adres voor de gebruiker.");


  var token = Random.id();
  var when = +(new Date);
  Meteor.users.update(userId, {$set: {
    "services.password.reset": {
      token: token,
      email: email,
      when: when
    }
  }});

  var enrollAccountUrl = Accounts.urls.enrollAccount(token);
  Email.send({
    to: email,
    from: Accounts.emailTemplates.from,
    subject: Accounts.emailTemplates.enrollAccount.subject(user),
    text: Accounts.emailTemplates.enrollAccount.text(user, enrollAccountUrl)
  });
};


// Take token from sendResetPasswordEmail or sendEnrollmentEmail, change
// the users password, and log them in.
Meteor.methods({resetPassword: function (token, newVerifier) {
  if (!token)
    throw new Meteor.Error(400, "Token moet doorgegeven worden.");
  if (!newVerifier)
    throw new Meteor.Error(400, "Nieuwe controle sleutel moet doorgegeven worden.");

  var user = Meteor.users.findOne({
    "services.password.reset.token": ""+token});
  if (!user)
    throw new Meteor.Error(403, "Token is verlopen.");
  var email = user.services.password.reset.email;
  if (!_.include(_.pluck(user.emails || [], 'address'), email))
    throw new Meteor.Error(403, "Token heeft onjuist email adres.");

  var stampedLoginToken = Accounts._generateStampedLoginToken();

  // Update the user record by:
  // - Changing the password verifier to the new one
  // - Replacing all valid login tokens with new ones (changing
  //   password should invalidate existing sessions).
  // - Forgetting about the reset token that was just used
  // - Verifying their email, since they got the password reset via email.
  Meteor.users.update({_id: user._id, 'emails.address': email}, {
    $set: {'services.password.srp': newVerifier,
           'services.resume.loginTokens': [stampedLoginToken],
           'emails.$.verified': true},
    $unset: {'services.password.reset': 1}
  });

  this.setUserId(user._id);
  return {token: stampedLoginToken.token, id: user._id};
}});

///
/// EMAIL VERIFICATION
///


// send the user an email with a link that when opened marks that
// address as verified
Accounts.sendVerificationEmail = function (userId, address) {
  // XXX Also generate a link using which someone can delete this
  // account if they own said address but weren't those who created
  // this account.

  // Make sure the user exists, and address is one of their addresses.
  var user = Meteor.users.findOne(userId);
  if (!user)
    throw new Error("Kan de gebruiker niet vinden.");
  // pick the first unverified address if we weren't passed an address.
  if (!address) {
    var email = _.find(user.emails || [],
                       function (e) { return !e.verified; });
    address = (email || {}).address;
  }
  // make sure we have a valid address
  if (!address || !_.contains(_.pluck(user.emails || [], 'address'), address))
    throw new Error("Niet bestaand email adres voor de gebruiker.");


  var tokenRecord = {
    token: Random.id(),
    address: address,
    when: +(new Date)};
  Meteor.users.update(
    {_id: userId},
    {$push: {'services.email.verificationTokens': tokenRecord}});

  var verifyEmailUrl = Accounts.urls.verifyEmail(tokenRecord.token);
  Email.send({
    to: address,
    from: Accounts.emailTemplates.from,
    subject: Accounts.emailTemplates.verifyEmail.subject(user),
    text: Accounts.emailTemplates.verifyEmail.text(user, verifyEmailUrl)
  });
};

// Take token from sendVerificationEmail, mark the email as verified,
// and log them in.
Meteor.methods({verifyEmail: function (token) {
  if (!token)
    throw new Meteor.Error(400, "Token moet doorgegeven worden.");

  var user = Meteor.users.findOne(
    {'services.email.verificationTokens.token': token});
  if (!user)
    throw new Meteor.Error(403, "Controle email link is verlopen.");

  var tokenRecord = _.find(user.services.email.verificationTokens,
                           function (t) {
                             return t.token == token;
                           });
  if (!tokenRecord)
    throw new Meteor.Error(403, "Controle email link is verlopen.");

  var emailsRecord = _.find(user.emails, function (e) {
    return e.address == tokenRecord.address;
  });
  if (!emailsRecord)
    throw new Meteor.Error(403, "Controle email link is voor niet bestaand adres.");

  // Log the user in with a new login token.
  var stampedLoginToken = Accounts._generateStampedLoginToken();

  // By including the address in the query, we can use 'emails.$' in the
  // modifier to get a reference to the specific object in the emails
  // array. See
  // http://www.mongodb.org/display/DOCS/Updating/#Updating-The%24positionaloperator)
  // http://www.mongodb.org/display/DOCS/Updating#Updating-%24pull
  Meteor.users.update(
    {_id: user._id,
     'emails.address': tokenRecord.address},
    {$set: {'emails.$.verified': true},
     $pull: {'services.email.verificationTokens': {token: token}},
     $push: {'services.resume.loginTokens': stampedLoginToken}});

  this.setUserId(user._id);
  return {token: stampedLoginToken.token, id: user._id};
}});



///
/// CREATING USERS
///

// Shared createUser function called from the createUser method, both
// if originates in client or server code. Calls user provided hooks,
// does the actual user insertion.
//
// returns an object with id: userId, and (if options.generateLoginToken is
// set) token: loginToken.
var createUser = function (options) {
  var username = options.username;
  var email = options.email;
  if (!username && !email)
    throw new Meteor.Error(400, "Gebruikersnaam of email adres moet gezet worden.");

  // Raw password. The meteor client doesn't send this, but a DDP
  // client that didn't implement SRP could send this. This should
  // only be done over SSL.
  if (options.password) {
    if (options.srp)
      throw new Meteor.Error(400, "Niet toegestaan om zowel wachtwoord als srp door te geven in options.");
    options.srp = Meteor._srp.generateVerifier(options.password);
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
  options = _.clone(options);
  options.generateLoginToken = true;
  if (Accounts._options.forbidClientAccountCreation)
    throw new Meteor.Error(403, "Aanmeldingen niet toegestaan.");

  // Create user. result contains id and token.
  var result = createUser(options);
  // safety belt. createUser is supposed to throw on error. send 500 error
  // instead of sending a verification email with empty userid.
  if (!result.id)
    throw new Error("createUser heeft gefaald bij het invoeren van een nieuwe gebruiker.");

  // If `Accounts._options.sendVerificationEmail` is set, register
  // a token to verify the user's primary email, and send it to
  // that address.
  if (options.email && Accounts._options.sendVerificationEmail)
    Accounts.sendVerificationEmail(result.id, options.email);

  // client gets logged in as the new user afterwards.
  this.setUserId(result.id);
  return result;
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
Accounts.createUser = function (options, callback) {
  options = _.clone(options);
  options.generateLoginToken = false;

  // XXX allow an optional callback?
  if (callback) {
    throw new Error("Accounts.createUser met callback wordt nog niet door de server ondersteunt.");
  }

  var userId = createUser(options).id;

  return userId;
};

///
/// PASSWORD-SPECIFIC INDEXES ON USERS
///
Meteor.users._ensureIndex('emails.validationTokens.token',
                          {unique: 1, sparse: 1});
Meteor.users._ensureIndex('emails.password.reset.token',
                          {unique: 1, sparse: 1});

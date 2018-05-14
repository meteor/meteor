/// BCRYPT

const bcrypt = NpmModuleBcrypt;
const bcryptHash = Meteor.wrapAsync(bcrypt.hash);
const bcryptCompare = Meteor.wrapAsync(bcrypt.compare);

// Utility for grabbing user
const getUserById = id => Meteor.users.findOne(id);

// User records have a 'services.password.bcrypt' field on them to hold
// their hashed passwords (unless they have a 'services.password.srp'
// field, in which case they will be upgraded to bcrypt the next time
// they log in).
//
// When the client sends a password to the server, it can either be a
// string (the plaintext password) or an object with keys 'digest' and
// 'algorithm' (must be "sha-256" for now). The Meteor client always sends
// password objects { digest: *, algorithm: "sha-256" }, but DDP clients
// that don't have access to SHA can just send plaintext passwords as
// strings.
//
// When the server receives a plaintext password as a string, it always
// hashes it with SHA256 before passing it into bcrypt. When the server
// receives a password as an object, it asserts that the algorithm is
// "sha-256" and then passes the digest to bcrypt.


Accounts._bcryptRounds = () => Accounts._options.bcryptRounds || 10;

// Given a 'password' from the client, extract the string that we should
// bcrypt. 'password' can be one of:
//  - String (the plaintext password)
//  - Object with 'digest' and 'algorithm' keys. 'algorithm' must be "sha-256".
//
const getPasswordString = password => {
  if (typeof password === "string") {
    password = SHA256(password);
  } else { // 'password' is an object
    if (password.algorithm !== "sha-256") {
      throw new Error("Invalid password hash algorithm. " +
                      "Only 'sha-256' is allowed.");
    }
    password = password.digest;
  }
  return password;
};

// Use bcrypt to hash the password for storage in the database.
// `password` can be a string (in which case it will be run through
// SHA256 before bcrypt) or an object with properties `digest` and
// `algorithm` (in which case we bcrypt `password.digest`).
//
const hashPassword = password => {
  password = getPasswordString(password);
  return bcryptHash(password, Accounts._bcryptRounds());
};

// Extract the number of rounds used in the specified bcrypt hash.
const getRoundsFromBcryptHash = hash => {
  let rounds;
  if (hash) {
    const hashSegments = hash.split('$');
    if (hashSegments.length > 2) {
      rounds = parseInt(hashSegments[2], 10);
    }
  }
  return rounds;
};

// Check whether the provided password matches the bcrypt'ed password in
// the database user record. `password` can be a string (in which case
// it will be run through SHA256 before bcrypt) or an object with
// properties `digest` and `algorithm` (in which case we bcrypt
// `password.digest`).
//
Accounts._checkPassword = (user, password) => {
  const result = {
    userId: user._id
  };

  const formattedPassword = getPasswordString(password);
  const hash = user.services.password.bcrypt;
  const hashRounds = getRoundsFromBcryptHash(hash);

  if (! bcryptCompare(formattedPassword, hash)) {
    result.error = handleError("Incorrect password", false);
  } else if (hash && Accounts._bcryptRounds() != hashRounds) {
    // The password checks out, but the user's bcrypt hash needs to be updated.
    Meteor.defer(() => {
      Meteor.users.update({ _id: user._id }, {
        $set: {
          'services.password.bcrypt':
            bcryptHash(formattedPassword, Accounts._bcryptRounds())
        }
      });
    });
  }

  return result;
};
const checkPassword = Accounts._checkPassword;

///
/// ERROR HANDLER
///
const handleError = (msg, throwError = true) => {
  const error = new Meteor.Error(
    403,
    Accounts._options.ambiguousErrorMessages
      ? "Something went wrong. Please check your credentials."
      : msg
  );
  if (throwError) {
    throw error;
  }
  return error;
};

///
/// LOGIN
///

Accounts._findUserByQuery = query => {
  let user = null;

  if (query.id) {
    user = getUserById(query.id);
  } else {
    let fieldName;
    let fieldValue;
    if (query.username) {
      fieldName = 'username';
      fieldValue = query.username;
    } else if (query.email) {
      fieldName = 'emails.address';
      fieldValue = query.email;
    } else {
      throw new Error("shouldn't happen (validation missed something)");
    }
    let selector = {};
    selector[fieldName] = fieldValue;
    user = Meteor.users.findOne(selector);
    // If user is not found, try a case insensitive lookup
    if (!user) {
      selector = selectorForFastCaseInsensitiveLookup(fieldName, fieldValue);
      const candidateUsers = Meteor.users.find(selector).fetch();
      // No match if multiple candidates are found
      if (candidateUsers.length === 1) {
        user = candidateUsers[0];
      }
    }
  }

  return user;
};

/**
 * @summary Finds the user with the specified username.
 * First tries to match username case sensitively; if that fails, it
 * tries case insensitively; but if more than one user matches the case
 * insensitive search, it returns null.
 * @locus Server
 * @param {String} username The username to look for
 * @returns {Object} A user if found, else null
 * @importFromPackage accounts-base
 */
Accounts.findUserByUsername = 
  username => Accounts._findUserByQuery({ username });

/**
 * @summary Finds the user with the specified email.
 * First tries to match email case sensitively; if that fails, it
 * tries case insensitively; but if more than one user matches the case
 * insensitive search, it returns null.
 * @locus Server
 * @param {String} email The email address to look for
 * @returns {Object} A user if found, else null
 * @importFromPackage accounts-base
 */
Accounts.findUserByEmail = email => Accounts._findUserByQuery({ email });

// Generates a MongoDB selector that can be used to perform a fast case
// insensitive lookup for the given fieldName and string. Since MongoDB does
// not support case insensitive indexes, and case insensitive regex queries
// are slow, we construct a set of prefix selectors for all permutations of
// the first 4 characters ourselves. We first attempt to matching against
// these, and because 'prefix expression' regex queries do use indexes (see
// http://docs.mongodb.org/v2.6/reference/operator/query/regex/#index-use),
// this has been found to greatly improve performance (from 1200ms to 5ms in a
// test with 1.000.000 users).
const selectorForFastCaseInsensitiveLookup = (fieldName, string) => {
  // Performance seems to improve up to 4 prefix characters
  const prefix = string.substring(0, Math.min(string.length, 4));
  const orClause = generateCasePermutationsForString(prefix).map(
    prefixPermutation => {
      const selector = {};
      selector[fieldName] =
        new RegExp(`^${Meteor._escapeRegExp(prefixPermutation)}`);
      return selector;
    });
  const caseInsensitiveClause = {};
  caseInsensitiveClause[fieldName] =
    new RegExp(`^${Meteor._escapeRegExp(string)}$`, 'i')
  return {$and: [{$or: orClause}, caseInsensitiveClause]};
}

// Generates permutations of all case variations of a given string.
const generateCasePermutationsForString = string => {
  let permutations = [''];
  for (let i = 0; i < string.length; i++) {
    const ch = string.charAt(i);
    permutations = [].concat(...(permutations.map(prefix => {
      const lowerCaseChar = ch.toLowerCase();
      const upperCaseChar = ch.toUpperCase();
      // Don't add unneccesary permutations when ch is not a letter
      if (lowerCaseChar === upperCaseChar) {
        return [prefix + ch];
      } else {
        return [prefix + lowerCaseChar, prefix + upperCaseChar];
      }
    })));
  }
  return permutations;
}

const checkForCaseInsensitiveDuplicates = (fieldName, displayName, fieldValue, ownUserId) => {
  // Some tests need the ability to add users with the same case insensitive
  // value, hence the _skipCaseInsensitiveChecksForTest check
  const skipCheck = Object.prototype.hasOwnProperty.call(Accounts._skipCaseInsensitiveChecksForTest, fieldValue);

  if (fieldValue && !skipCheck) {
    const matchedUsers = Meteor.users.find(
      selectorForFastCaseInsensitiveLookup(fieldName, fieldValue)).fetch();

    if (matchedUsers.length > 0 &&
        // If we don't have a userId yet, any match we find is a duplicate
        (!ownUserId ||
        // Otherwise, check to see if there are multiple matches or a match
        // that is not us
        (matchedUsers.length > 1 || matchedUsers[0]._id !== ownUserId))) {
      handleError(`${displayName} already exists.`);
    }
  }
};

// XXX maybe this belongs in the check package
const NonEmptyString = Match.Where(x => {
  check(x, String);
  return x.length > 0;
});

const userQueryValidator = Match.Where(user => {
  check(user, {
    id: Match.Optional(NonEmptyString),
    username: Match.Optional(NonEmptyString),
    email: Match.Optional(NonEmptyString)
  });
  if (Object.keys(user).length !== 1)
    throw new Match.Error("User property must have exactly one field");
  return true;
});

const passwordValidator = Match.OneOf(
  String,
  { digest: String, algorithm: String }
);

// Handler to login with a password.
//
// The Meteor client sets options.password to an object with keys
// 'digest' (set to SHA256(password)) and 'algorithm' ("sha-256").
//
// For other DDP clients which don't have access to SHA, the handler
// also accepts the plaintext password in options.password as a string.
//
// (It might be nice if servers could turn the plaintext password
// option off. Or maybe it should be opt-in, not opt-out?
// Accounts.config option?)
//
// Note that neither password option is secure without SSL.
//
Accounts.registerLoginHandler("password", options => {
  if (! options.password || options.srp)
    return undefined; // don't handle

  check(options, {
    user: userQueryValidator,
    password: passwordValidator
  });


  const user = Accounts._findUserByQuery(options.user);
  if (!user) {
    handleError("User not found");
  }

  if (!user.services || !user.services.password ||
      !(user.services.password.bcrypt || user.services.password.srp)) {
    handleError("User has no password set");
  }

  if (!user.services.password.bcrypt) {
    if (typeof options.password === "string") {
      // The client has presented a plaintext password, and the user is
      // not upgraded to bcrypt yet. We don't attempt to tell the client
      // to upgrade to bcrypt, because it might be a standalone DDP
      // client doesn't know how to do such a thing.
      const verifier = user.services.password.srp;
      const newVerifier = SRP.generateVerifier(options.password, {
        identity: verifier.identity, salt: verifier.salt});

      if (verifier.verifier !== newVerifier.verifier) {
        return {
          userId: Accounts._options.ambiguousErrorMessages ? null : user._id,
          error: handleError("Incorrect password", false)
        };
      }

      return {userId: user._id};
    } else {
      // Tell the client to use the SRP upgrade process.
      throw new Meteor.Error(400, "old password format", EJSON.stringify({
        format: 'srp',
        identity: user.services.password.srp.identity
      }));
    }
  }

  return checkPassword(
    user,
    options.password
  );
});

// Handler to login using the SRP upgrade path. To use this login
// handler, the client must provide:
//   - srp: H(identity + ":" + password)
//   - password: a string or an object with properties 'digest' and 'algorithm'
//
// We use `options.srp` to verify that the client knows the correct
// password without doing a full SRP flow. Once we've checked that, we
// upgrade the user to bcrypt and remove the SRP information from the
// user document.
//
// The client ends up using this login handler after trying the normal
// login handler (above), which throws an error telling the client to
// try the SRP upgrade path.
//
// XXX COMPAT WITH 0.8.1.3
Accounts.registerLoginHandler("password", options => {
  if (!options.srp || !options.password) {
    return undefined; // don't handle
  }

  check(options, {
    user: userQueryValidator,
    srp: String,
    password: passwordValidator
  });

  const user = Accounts._findUserByQuery(options.user);
  if (!user) {
    handleError("User not found");
  }

  // Check to see if another simultaneous login has already upgraded
  // the user record to bcrypt.
  if (user.services && user.services.password && user.services.password.bcrypt) {
    return checkPassword(user, options.password);
  }

  if (!(user.services && user.services.password && user.services.password.srp)) {
    handleError("User has no password set");
  }

  const v1 = user.services.password.srp.verifier;
  const v2 = SRP.generateVerifier(
    null,
    {
      hashedIdentityAndPassword: options.srp,
      salt: user.services.password.srp.salt
    }
  ).verifier;
  if (v1 !== v2) {
    return {
      userId: Accounts._options.ambiguousErrorMessages ? null : user._id,
      error: handleError("Incorrect password", false)
    };
  }

  // Upgrade to bcrypt on successful login.
  const salted = hashPassword(options.password);
  Meteor.users.update(
    user._id,
    {
      $unset: { 'services.password.srp': 1 },
      $set: { 'services.password.bcrypt': salted }
    }
  );

  return {userId: user._id};
});


///
/// CHANGING
///

/**
 * @summary Change a user's username. Use this instead of updating the
 * database directly. The operation will fail if there is an existing user
 * with a username only differing in case.
 * @locus Server
 * @param {String} userId The ID of the user to update.
 * @param {String} newUsername A new username for the user.
 * @importFromPackage accounts-base
 */
Accounts.setUsername = (userId, newUsername) => {
  check(userId, NonEmptyString);
  check(newUsername, NonEmptyString);

  const user = getUserById(userId);
  if (!user) {
    handleError("User not found");
  }

  const oldUsername = user.username;

  // Perform a case insensitive check for duplicates before update
  checkForCaseInsensitiveDuplicates('username', 'Username', newUsername, user._id);

  Meteor.users.update({_id: user._id}, {$set: {username: newUsername}});

  // Perform another check after update, in case a matching user has been
  // inserted in the meantime
  try {
    checkForCaseInsensitiveDuplicates('username', 'Username', newUsername, user._id);
  } catch (ex) {
    // Undo update if the check fails
    Meteor.users.update({_id: user._id}, {$set: {username: oldUsername}});
    throw ex;
  }
};

// Let the user change their own password if they know the old
// password. `oldPassword` and `newPassword` should be objects with keys
// `digest` and `algorithm` (representing the SHA256 of the password).
//
// XXX COMPAT WITH 0.8.1.3
// Like the login method, if the user hasn't been upgraded from SRP to
// bcrypt yet, then this method will throw an 'old password format'
// error. The client should call the SRP upgrade login handler and then
// retry this method again.
//
// UNLIKE the login method, there is no way to avoid getting SRP upgrade
// errors thrown. The reasoning for this is that clients using this
// method directly will need to be updated anyway because we no longer
// support the SRP flow that they would have been doing to use this
// method previously.
Meteor.methods({changePassword: function (oldPassword, newPassword) {
  check(oldPassword, passwordValidator);
  check(newPassword, passwordValidator);

  if (!this.userId) {
    throw new Meteor.Error(401, "Must be logged in");
  }

  const user = getUserById(this.userId);
  if (!user) {
    handleError("User not found");
  }

  if (!user.services || !user.services.password ||
      (!user.services.password.bcrypt && !user.services.password.srp)) {
    handleError("User has no password set");
  }

  if (! user.services.password.bcrypt) {
    throw new Meteor.Error(400, "old password format", EJSON.stringify({
      format: 'srp',
      identity: user.services.password.srp.identity
    }));
  }

  const result = checkPassword(user, oldPassword);
  if (result.error) {
    throw result.error;
  }

  const hashed = hashPassword(newPassword);

  // It would be better if this removed ALL existing tokens and replaced
  // the token for the current connection with a new one, but that would
  // be tricky, so we'll settle for just replacing all tokens other than
  // the one for the current connection.
  const currentToken = Accounts._getLoginToken(this.connection.id);
  Meteor.users.update(
    { _id: this.userId },
    {
      $set: { 'services.password.bcrypt': hashed },
      $pull: {
        'services.resume.loginTokens': { hashedToken: { $ne: currentToken } }
      },
      $unset: { 'services.password.reset': 1 }
    }
  );

  return {passwordChanged: true};
}});


// Force change the users password.

/**
 * @summary Forcibly change the password for a user.
 * @locus Server
 * @param {String} userId The id of the user to update.
 * @param {String} newPassword A new password for the user.
 * @param {Object} [options]
 * @param {Object} options.logout Logout all current connections with this userId (default: true)
 * @importFromPackage accounts-base
 */
Accounts.setPassword = (userId, newPlaintextPassword, options) => {
  options = { logout: true , ...options };

  const user = getUserById(userId);
  if (!user) {
    throw new Meteor.Error(403, "User not found");
  }

  const update = {
    $unset: {
      'services.password.srp': 1, // XXX COMPAT WITH 0.8.1.3
      'services.password.reset': 1
    },
    $set: {'services.password.bcrypt': hashPassword(newPlaintextPassword)}
  };

  if (options.logout) {
    update.$unset['services.resume.loginTokens'] = 1;
  }

  Meteor.users.update({_id: user._id}, update);
};


///
/// RESETTING VIA EMAIL
///

// Utility for plucking addresses from emails
const pluckAddresses = (emails = []) => emails.map(email => email.address);

// Method called by a user to request a password reset email. This is
// the start of the reset process.
Meteor.methods({forgotPassword: options => {
  check(options, {email: String});

  const user = Accounts.findUserByEmail(options.email);
  if (!user) {
    handleError("User not found");
  }

  const emails = pluckAddresses(user.emails);
  const caseSensitiveEmail = emails.find(
    email => email.toLowerCase() === options.email.toLowerCase()
  );

  Accounts.sendResetPasswordEmail(user._id, caseSensitiveEmail);
}});

/**
 * @summary Generates a reset token and saves it into the database.
 * @locus Server
 * @param {String} userId The id of the user to generate the reset token for.
 * @param {String} email Which address of the user to generate the reset token for. This address must be in the user's `emails` list. If `null`, defaults to the first email in the list.
 * @param {String} reason `resetPassword` or `enrollAccount`.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @returns {Object} Object with {email, user, token} values.
 * @importFromPackage accounts-base
 */
Accounts.generateResetToken = (userId, email, reason, extraTokenData) => {
  // Make sure the user exists, and email is one of their addresses.
  const user = getUserById(userId);
  if (!user) {
    handleError("Can't find user");
  }

  // pick the first email if we weren't passed an email.
  if (!email && user.emails && user.emails[0]) {
    email = user.emails[0].address;
  }

  // make sure we have a valid email
  if (!email || 
    !(pluckAddresses(user.emails).includes(email))) {
    handleError("No such email for user.");
  }

  const token = Random.secret();
  const tokenRecord = {
    token,
    email,
    when: new Date()
  };

  if (reason === 'resetPassword') {
    tokenRecord.reason = 'reset';
  } else if (reason === 'enrollAccount') {
    tokenRecord.reason = 'enroll';
  } else if (reason) {
    // fallback so that this function can be used for unknown reasons as well
    tokenRecord.reason = reason;
  }

  if (extraTokenData) {
    Object.assign(tokenRecord, extraTokenData);
  }

  Meteor.users.update({_id: user._id}, {$set: {
    'services.password.reset': tokenRecord
  }});

  // before passing to template, update user object with new token
  Meteor._ensure(user, 'services', 'password').reset = tokenRecord;

  return {email, user, token};
};

/**
 * @summary Generates an e-mail verification token and saves it into the database.
 * @locus Server
 * @param {String} userId The id of the user to generate the  e-mail verification token for.
 * @param {String} email Which address of the user to generate the e-mail verification token for. This address must be in the user's `emails` list. If `null`, defaults to the first unverified email in the list.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @returns {Object} Object with {email, user, token} values.
 * @importFromPackage accounts-base
 */
Accounts.generateVerificationToken = (userId, email, extraTokenData) => {
  // Make sure the user exists, and email is one of their addresses.
  const user = getUserById(userId);
  if (!user) {
    handleError("Can't find user");
  }

  // pick the first unverified email if we weren't passed an email.
  if (!email) {
    const emailRecord = (user.emails || []).find(e => !e.verified);
    email = (emailRecord || {}).address;

    if (!email) {
      handleError("That user has no unverified email addresses.");
    }
  }

  // make sure we have a valid email
  if (!email || 
    !(pluckAddresses(user.emails).includes(email))) {
    handleError("No such email for user.");
  }

  const token = Random.secret();
  const tokenRecord = {
    token,
    // TODO: This should probably be renamed to "email" to match reset token record.
    address: email,
    when: new Date()
  };

  if (extraTokenData) {
    Object.assign(tokenRecord, extraTokenData);
  }

  Meteor.users.update({_id: user._id}, {$push: {
    'services.email.verificationTokens': tokenRecord
  }});

  // before passing to template, update user object with new token
  Meteor._ensure(user, 'services', 'email');
  if (!user.services.email.verificationTokens) {
    user.services.email.verificationTokens = [];
  }
  user.services.email.verificationTokens.push(tokenRecord);

  return {email, user, token};
};

/**
 * @summary Creates options for email sending for reset password and enroll account emails.
 * You can use this function when customizing a reset password or enroll account email sending.
 * @locus Server
 * @param {Object} email Which address of the user's to send the email to.
 * @param {Object} user The user object to generate options for.
 * @param {String} url URL to which user is directed to confirm the email.
 * @param {String} reason `resetPassword` or `enrollAccount`.
 * @returns {Object} Options which can be passed to `Email.send`.
 * @importFromPackage accounts-base
 */
Accounts.generateOptionsForEmail = (email, user, url, reason) => {
  const options = {
    to: email,
    from: Accounts.emailTemplates[reason].from
      ? Accounts.emailTemplates[reason].from(user)
      : Accounts.emailTemplates.from,
    subject: Accounts.emailTemplates[reason].subject(user)
  };

  if (typeof Accounts.emailTemplates[reason].text === 'function') {
    options.text = Accounts.emailTemplates[reason].text(user, url);
  }

  if (typeof Accounts.emailTemplates[reason].html === 'function') {
    options.html = Accounts.emailTemplates[reason].html(user, url);
  }

  if (typeof Accounts.emailTemplates.headers === 'object') {
    options.headers = Accounts.emailTemplates.headers;
  }

  return options;
};

// send the user an email with a link that when opened allows the user
// to set a new password, without the old password.

/**
 * @summary Send an email with a link the user can use to reset their password.
 * @locus Server
 * @param {String} userId The id of the user to send email to.
 * @param {String} [email] Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first email in the list.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendResetPasswordEmail = (userId, email, extraTokenData) => {
  const {email: realEmail, user, token} =
    Accounts.generateResetToken(userId, email, 'resetPassword', extraTokenData);
  const url = Accounts.urls.resetPassword(token);
  const options = Accounts.generateOptionsForEmail(realEmail, user, url, 'resetPassword');
  Email.send(options);
  return {email: realEmail, user, token, url, options};
};

// send the user an email informing them that their account was created, with
// a link that when opened both marks their email as verified and forces them
// to choose their password. The email must be one of the addresses in the
// user's emails field, or undefined to pick the first email automatically.
//
// This is not called automatically. It must be called manually if you
// want to use enrollment emails.

/**
 * @summary Send an email with a link the user can use to set their initial password.
 * @locus Server
 * @param {String} userId The id of the user to send email to.
 * @param {String} [email] Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first email in the list.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendEnrollmentEmail = (userId, email, extraTokenData) => {
  const {email: realEmail, user, token} =
    Accounts.generateResetToken(userId, email, 'enrollAccount', extraTokenData);
  const url = Accounts.urls.enrollAccount(token);
  const options = Accounts.generateOptionsForEmail(realEmail, user, url, 'enrollAccount');
  Email.send(options);
  return {email: realEmail, user, token, url, options};
};


// Take token from sendResetPasswordEmail or sendEnrollmentEmail, change
// the users password, and log them in.
Meteor.methods({resetPassword: function (...args) {
  const token = args[0];
  const newPassword = args[1];
  return Accounts._loginMethod(
    this,
    "resetPassword",
    args,
    "password",
    () => {
      check(token, String);
      check(newPassword, passwordValidator);

      const user = Meteor.users.findOne({
        "services.password.reset.token": token});
      if (!user) {
        throw new Meteor.Error(403, "Token expired");
      }
      const { when, reason, email } = user.services.password.reset;
      let tokenLifetimeMs = Accounts._getPasswordResetTokenLifetimeMs();
      if (reason === "enroll") {
        tokenLifetimeMs = Accounts._getPasswordEnrollTokenLifetimeMs();
      }
      const currentTimeMs = Date.now();
      if ((currentTimeMs - when) > tokenLifetimeMs)
        throw new Meteor.Error(403, "Token expired");
      if (!(pluckAddresses(user.emails).includes(email)))
        return {
          userId: user._id,
          error: new Meteor.Error(403, "Token has invalid email address")
        };

      const hashed = hashPassword(newPassword);

      // NOTE: We're about to invalidate tokens on the user, who we might be
      // logged in as. Make sure to avoid logging ourselves out if this
      // happens. But also make sure not to leave the connection in a state
      // of having a bad token set if things fail.
      const oldToken = Accounts._getLoginToken(this.connection.id);
      Accounts._setLoginToken(user._id, this.connection, null);
      const resetToOldToken = () =>
        Accounts._setLoginToken(user._id, this.connection, oldToken);

      try {
        // Update the user record by:
        // - Changing the password to the new one
        // - Forgetting about the reset token that was just used
        // - Verifying their email, since they got the password reset via email.
        const affectedRecords = Meteor.users.update(
          {
            _id: user._id,
            'emails.address': email,
            'services.password.reset.token': token
          },
          {$set: {'services.password.bcrypt': hashed,
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

/**
 * @summary Send an email with a link the user can use verify their email address.
 * @locus Server
 * @param {String} userId The id of the user to send email to.
 * @param {String} [email] Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first unverified email in the list.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendVerificationEmail = (userId, email, extraTokenData) => {
  // XXX Also generate a link using which someone can delete this
  // account if they own said address but weren't those who created
  // this account.

  const {email: realEmail, user, token} =
    Accounts.generateVerificationToken(userId, email, extraTokenData);
  const url = Accounts.urls.verifyEmail(token);
  const options = Accounts.generateOptionsForEmail(realEmail, user, url, 'verifyEmail');
  Email.send(options);
  return {email: realEmail, user, token, url, options};
};

// Take token from sendVerificationEmail, mark the email as verified,
// and log them in.
Meteor.methods({verifyEmail: function (...args) {
  const token = args[0];
  return Accounts._loginMethod(
    this,
    "verifyEmail",
    args,
    "password",
    () => {
      check(token, String);

      const user = Meteor.users.findOne(
        {'services.email.verificationTokens.token': token});
      if (!user)
        throw new Meteor.Error(403, "Verify email link expired");

        const tokenRecord = user.services.email.verificationTokens.find(
          t => t.token == token
        );
      if (!tokenRecord)
        return {
          userId: user._id,
          error: new Meteor.Error(403, "Verify email link expired")
        };

      const emailsRecord = user.emails.find(
        e => e.address == tokenRecord.address
      );
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
         $pull: {'services.email.verificationTokens': {address: tokenRecord.address}}});

      return {userId: user._id};
    }
  );
}});

/**
 * @summary Add an email address for a user. Use this instead of directly
 * updating the database. The operation will fail if there is a different user
 * with an email only differing in case. If the specified user has an existing
 * email only differing in case however, we replace it.
 * @locus Server
 * @param {String} userId The ID of the user to update.
 * @param {String} newEmail A new email address for the user.
 * @param {Boolean} [verified] Optional - whether the new email address should
 * be marked as verified. Defaults to false.
 * @importFromPackage accounts-base
 */
Accounts.addEmail = (userId, newEmail, verified) => {
  check(userId, NonEmptyString);
  check(newEmail, NonEmptyString);
  check(verified, Match.Optional(Boolean));

  if (verified === void 0) {
    verified = false;
  }

  const user = getUserById(userId);
  if (!user)
    throw new Meteor.Error(403, "User not found");

  // Allow users to change their own email to a version with a different case

  // We don't have to call checkForCaseInsensitiveDuplicates to do a case
  // insensitive check across all emails in the database here because: (1) if
  // there is no case-insensitive duplicate between this user and other users,
  // then we are OK and (2) if this would create a conflict with other users
  // then there would already be a case-insensitive duplicate and we can't fix
  // that in this code anyway.
  const caseInsensitiveRegExp =
    new RegExp(`^${Meteor._escapeRegExp(newEmail)}$`, 'i');

  const didUpdateOwnEmail = user.emails.reduce(
    (prev, email) => {
      if (caseInsensitiveRegExp.test(email.address)) {
        Meteor.users.update({
          _id: user._id,
          'emails.address': email.address
        }, {$set: {
          'emails.$.address': newEmail,
          'emails.$.verified': verified
        }});
        return true;
      } else {
        return prev;
      }
    }, 
    false
  );

  // In the other updates below, we have to do another call to
  // checkForCaseInsensitiveDuplicates to make sure that no conflicting values
  // were added to the database in the meantime. We don't have to do this for
  // the case where the user is updating their email address to one that is the
  // same as before, but only different because of capitalization. Read the
  // big comment above to understand why.

  if (didUpdateOwnEmail) {
    return;
  }

  // Perform a case insensitive check for duplicates before update
  checkForCaseInsensitiveDuplicates('emails.address', 'Email', newEmail, user._id);

  Meteor.users.update({
    _id: user._id
  }, {
    $addToSet: {
      emails: {
        address: newEmail,
        verified: verified
      }
    }
  });

  // Perform another check after update, in case a matching user has been
  // inserted in the meantime
  try {
    checkForCaseInsensitiveDuplicates('emails.address', 'Email', newEmail, user._id);
  } catch (ex) {
    // Undo update if the check fails
    Meteor.users.update({_id: user._id},
      {$pull: {emails: {address: newEmail}}});
    throw ex;
  }
}

/**
 * @summary Remove an email address for a user. Use this instead of updating
 * the database directly.
 * @locus Server
 * @param {String} userId The ID of the user to update.
 * @param {String} email The email address to remove.
 * @importFromPackage accounts-base
 */
Accounts.removeEmail = (userId, email) => {
  check(userId, NonEmptyString);
  check(email, NonEmptyString);

  const user = getUserById(userId);
  if (!user)
    throw new Meteor.Error(403, "User not found");

  Meteor.users.update({_id: user._id},
    {$pull: {emails: {address: email}}});
}

///
/// CREATING USERS
///

// Shared createUser function called from the createUser method, both
// if originates in client or server code. Calls user provided hooks,
// does the actual user insertion.
//
// returns the user id
const createUser = options => {
  // Unknown keys allowed, because a onCreateUserHook can take arbitrary
  // options.
  check(options, Match.ObjectIncluding({
    username: Match.Optional(String),
    email: Match.Optional(String),
    password: Match.Optional(passwordValidator)
  }));

  const { username, email, password } = options;
  if (!username && !email)
    throw new Meteor.Error(400, "Need to set a username or email");

  const user = {services: {}};
  if (password) {
    const hashed = hashPassword(password);
    user.services.password = { bcrypt: hashed };
  }

  if (username)
    user.username = username;
  if (email)
    user.emails = [{address: email, verified: false}];

  // Perform a case insensitive check before insert
  checkForCaseInsensitiveDuplicates('username', 'Username', username);
  checkForCaseInsensitiveDuplicates('emails.address', 'Email', email);

  const userId = Accounts.insertUserDoc(options, user);
  // Perform another check after insert, in case a matching user has been
  // inserted in the meantime
  try {
    checkForCaseInsensitiveDuplicates('username', 'Username', username, userId);
    checkForCaseInsensitiveDuplicates('emails.address', 'Email', email, userId);
  } catch (ex) {
    // Remove inserted user if the check fails
    Meteor.users.remove(userId);
    throw ex;
  }
  return userId;
};

// method for create user. Requests come from the client.
Meteor.methods({createUser: function (...args) {
  const options = args[0];
  return Accounts._loginMethod(
    this,
    "createUser",
    args,
    "password",
    () => {
      // createUser() above does more checking.
      check(options, Object);
      if (Accounts._options.forbidClientAccountCreation)
        return {
          error: new Meteor.Error(403, "Signups forbidden")
        };

      // Create user. result contains id and token.
      const userId = createUser(options);
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
Accounts.createUser = (options, callback) => {
  options = { ...options };

  // XXX allow an optional callback?
  if (callback) {
    throw new Error("Accounts.createUser with callback not supported on the server yet.");
  }

  return createUser(options);
};

///
/// PASSWORD-SPECIFIC INDEXES ON USERS
///
Meteor.users._ensureIndex('services.email.verificationTokens.token',
                          {unique: 1, sparse: 1});
Meteor.users._ensureIndex('services.password.reset.token',
                          {unique: 1, sparse: 1});

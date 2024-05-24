import { hash as bcryptHash, compare as bcryptCompare } from 'bcrypt';
import { Accounts } from "meteor/accounts-base";

var Future = Npm.require('fibers/future');

// Utility for grabbing user
const getUserById = (id, options) => Meteor.users.findOne(id, Accounts._addDefaultFieldSelector(options));
const getUserByIdAsync = (id, options) => Meteor.users.findOneAsync(id, Accounts._addDefaultFieldSelector(options));

// User records have a 'services.password.bcrypt' field on them to hold
// their hashed passwords.
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
const hashPassword = async password => {
  password = getPasswordString(password);
  return await bcryptHash(password, Accounts._bcryptRounds());
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
// The user parameter needs at least user._id and user.services
Accounts._checkPasswordUserFields = {_id: 1, services: 1};
//
const checkPasswordAsync = async (user, password) => {
  const result = {
    userId: user._id
  };

  const formattedPassword = getPasswordString(password);
  const hash = user.services.password.bcrypt;
  const hashRounds = getRoundsFromBcryptHash(hash);

  if (! await bcryptCompare(formattedPassword, hash)) {
    result.error = Accounts._handleError("Incorrect password", false);
  } else if (hash && Accounts._bcryptRounds() != hashRounds) {
    // The password checks out, but the user's bcrypt hash needs to be updated.

    Meteor.defer(async () => {
      Meteor.users.update({ _id: user._id }, {
        $set: {
          'services.password.bcrypt':
            await bcryptHash(formattedPassword, Accounts._bcryptRounds())
        }
      });
    });
  }

  return result;
};

const checkPassword = (user, password) => {
  return Promise.await(checkPasswordAsync(user, password));
};

Accounts._checkPassword = checkPassword;
Accounts._checkPasswordAsync =  checkPasswordAsync;

///
/// LOGIN
///


/**
 * @summary Finds the user with the specified username.
 * First tries to match username case sensitively; if that fails, it
 * tries case insensitively; but if more than one user matches the case
 * insensitive search, it returns null.
 * @locus Server
 * @param {String} username The username to look for
 * @param {Object} [options]
 * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
 * @returns {Object} A user if found, else null
 * @importFromPackage accounts-base
 */
Accounts.findUserByUsername =
  (username, options) => Accounts._findUserByQuery({ username }, options);

/**
 * @summary Finds the user with the specified email.
 * First tries to match email case sensitively; if that fails, it
 * tries case insensitively; but if more than one user matches the case
 * insensitive search, it returns null.
 * @locus Server
 * @param {String} email The email address to look for
 * @param {Object} [options]
 * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
 * @returns {Object} A user if found, else null
 * @importFromPackage accounts-base
 */
Accounts.findUserByEmail =
  (email, options) => Accounts._findUserByQuery({ email }, options);

// XXX maybe this belongs in the check package
const NonEmptyString = Match.Where(x => {
  check(x, String);
  return x.length > 0;
});

const passwordValidator = Match.OneOf(
  Match.Where(str => Match.test(str, String) && str.length <= Meteor.settings?.packages?.accounts?.passwordMaxLength || 256), {
    digest: Match.Where(str => Match.test(str, String) && str.length === 64),
    algorithm: Match.OneOf('sha-256')
  }
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
Accounts.registerLoginHandler("password", async options => {
  if (!options.password)
    return undefined; // don't handle

  check(options, {
    user: Accounts._userQueryValidator,
    password: passwordValidator,
    code: Match.Optional(NonEmptyString),
  });


  const user = Accounts._findUserByQuery(options.user, {fields: {
    services: 1,
    ...Accounts._checkPasswordUserFields,
  }});
  if (!user) {
    Accounts._handleError("User not found");
  }


  if (!user.services || !user.services.password ||
      !user.services.password.bcrypt) {
    Accounts._handleError("User has no password set");
  }

  const result = await checkPasswordAsync(user, options.password);
  // This method is added by the package accounts-2fa
  // First the login is validated, then the code situation is checked
  if (
    !result.error &&
    Accounts._check2faEnabled?.(user)
  ) {
    if (!options.code) {
      Accounts._handleError('2FA code must be informed', true, 'no-2fa-code');
    }
    if (
      !Accounts._isTokenValid(
        user.services.twoFactorAuthentication.secret,
        options.code
      )
    ) {
      Accounts._handleError('Invalid 2FA code', true, 'invalid-2fa-code');
    }
  }

  return result;
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

  const user = getUserById(userId, {fields: {
    username: 1,
  }});
  if (!user) {
    Accounts._handleError("User not found");
  }

  const oldUsername = user.username;

  // Perform a case insensitive check for duplicates before update
  Accounts._checkForCaseInsensitiveDuplicates('username',
    'Username', newUsername, user._id);

  Meteor.users.update({_id: user._id}, {$set: {username: newUsername}});

  // Perform another check after update, in case a matching user has been
  // inserted in the meantime
  try {
    Accounts._checkForCaseInsensitiveDuplicates('username',
      'Username', newUsername, user._id);
  } catch (ex) {
    // Undo update if the check fails
    Meteor.users.update({_id: user._id}, {$set: {username: oldUsername}});
    throw ex;
  }
};

// Let the user change their own password if they know the old
// password. `oldPassword` and `newPassword` should be objects with keys
// `digest` and `algorithm` (representing the SHA256 of the password).
Meteor.methods({changePassword: async function (oldPassword, newPassword) {
  check(oldPassword, passwordValidator);
  check(newPassword, passwordValidator);

  if (!this.userId) {
    throw new Meteor.Error(401, "Must be logged in");
  }

  const user = getUserById(this.userId, {fields: {
    services: 1,
    ...Accounts._checkPasswordUserFields,
  }});
  if (!user) {
    Accounts._handleError("User not found");
  }

  if (!user.services || !user.services.password || !user.services.password.bcrypt) {
    Accounts._handleError("User has no password set");
  }

  const result = await checkPasswordAsync(user, oldPassword);
  if (result.error) {
    throw result.error;
  }

  const hashed = await hashPassword(newPassword);

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
Accounts.setPasswordAsync = async (userId, newPlaintextPassword, options) => {
  check(userId, String);
  check(newPlaintextPassword, Match.Where(str => Match.test(str, String) && str.length <= Meteor.settings?.packages?.accounts?.passwordMaxLength || 256));
  check(options, Match.Maybe({ logout: Boolean }));
  options = { logout: true , ...options };

  const user = getUserById(userId, {fields: {_id: 1}});
  if (!user) {
    throw new Meteor.Error(403, "User not found");
  }

  const update = {
    $unset: {
      'services.password.reset': 1
    },
    $set: {'services.password.bcrypt': await hashPassword(newPlaintextPassword)}
  };

  if (options.logout) {
    update.$unset['services.resume.loginTokens'] = 1;
  }

  await Meteor.users.updateAsync({_id: user._id}, update);
};

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
  return Promise.await(Accounts.setPasswordAsync(userId, newPlaintextPassword, options));
};


///
/// RESETTING VIA EMAIL
///

// Utility for plucking addresses from emails
const pluckAddresses = (emails = []) => emails.map(email => email.address);

// Method called by a user to request a password reset email. This is
// the start of the reset process.
Meteor.methods({forgotPassword: options => {
  check(options, {email: String})

  const user = Accounts.findUserByEmail(options.email, { fields: { emails: 1 } });

  if (!user) {
    Accounts._handleError("User not found");
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
  // Don't limit the fields in the user object since the user is returned
  // by the function and some other fields might be used elsewhere.
  const user = getUserById(userId);
  if (!user) {
    Accounts._handleError("Can't find user");
  }

  // pick the first email if we weren't passed an email.
  if (!email && user.emails && user.emails[0]) {
    email = user.emails[0].address;
  }

  // make sure we have a valid email
  if (!email ||
    !(pluckAddresses(user.emails).includes(email))) {
    Accounts._handleError("No such email for user.");
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
  // if this method is called from the enroll account work-flow then
  // store the token record in 'services.password.enroll' db field
  // else store the token record in in 'services.password.reset' db field
  if(reason === 'enrollAccount') {
    Meteor.users.update({_id: user._id}, {
      $set : {
        'services.password.enroll': tokenRecord
      }
    });
    // before passing to template, update user object with new token
    Meteor._ensure(user, 'services', 'password').enroll = tokenRecord;
  } else {
    Meteor.users.update({_id: user._id}, {
      $set : {
        'services.password.reset': tokenRecord
      }
    });
    // before passing to template, update user object with new token
    Meteor._ensure(user, 'services', 'password').reset = tokenRecord;
  }

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
  // Don't limit the fields in the user object since the user is returned
  // by the function and some other fields might be used elsewhere.
  const user = getUserById(userId);
  if (!user) {
    Accounts._handleError("Can't find user");
  }

  // pick the first unverified email if we weren't passed an email.
  if (!email) {
    const emailRecord = (user.emails || []).find(e => !e.verified);
    email = (emailRecord || {}).address;

    if (!email) {
      Accounts._handleError("That user has no unverified email addresses.");
    }
  }

  // make sure we have a valid email
  if (!email ||
    !(pluckAddresses(user.emails).includes(email))) {
    Accounts._handleError("No such email for user.");
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


// send the user an email with a link that when opened allows the user
// to set a new password, without the old password.

/**
 * @summary Send an email with a link the user can use to reset their password.
 * @locus Server
 * @param {String} userId The id of the user to send email to.
 * @param {String} [email] Optional. Which address of the user's to send the email to. This address must be in the user's `emails` list. Defaults to the first email in the list.
 * @param {Object} [extraTokenData] Optional additional data to be added into the token record.
 * @param {Object} [extraParams] Optional additional params to be added to the reset url.
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendResetPasswordEmail = (userId, email, extraTokenData, extraParams) => {
  const {email: realEmail, user, token} =
    Accounts.generateResetToken(userId, email, 'resetPassword', extraTokenData);
  const url = Accounts.urls.resetPassword(token, extraParams);
  const options = Accounts.generateOptionsForEmail(realEmail, user, url, 'resetPassword');
  Email.send(options);
  if (Meteor.isDevelopment) {
    console.log(`\nReset password URL: ${url}`);
  }
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
 * @param {Object} [extraParams] Optional additional params to be added to the enrollment url.
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendEnrollmentEmail = (userId, email, extraTokenData, extraParams) => {
  const {email: realEmail, user, token} =
    Accounts.generateResetToken(userId, email, 'enrollAccount', extraTokenData);
  const url = Accounts.urls.enrollAccount(token, extraParams);
  const options = Accounts.generateOptionsForEmail(realEmail, user, url, 'enrollAccount');
  Email.send(options);
  if (Meteor.isDevelopment) {
    console.log(`\nEnrollment email URL: ${url}`);
  }
  return {email: realEmail, user, token, url, options};
};


// Take token from sendResetPasswordEmail or sendEnrollmentEmail, change
// the users password, and log them in.
Meteor.methods({resetPassword: async function (...args) {
  const token = args[0];
  const newPassword = args[1];
  return await Accounts._loginMethod(
    this,
    "resetPassword",
    args,
    "password",
    async () => {
      check(token, String);
      check(newPassword, passwordValidator);

      let user = Meteor.users.findOne(
        {"services.password.reset.token": token},
        {fields: {
          services: 1,
          emails: 1,
        }}
      );

      let isEnroll = false;
      // if token is in services.password.reset db field implies
      // this method is was not called from enroll account workflow
      // else this method is called from enroll account workflow
      if(!user) {
        user = Meteor.users.findOne(
          {"services.password.enroll.token": token},
          {fields: {
            services: 1,
            emails: 1,
          }}
        );
        isEnroll = true;
      }
      if (!user) {
        throw new Meteor.Error(403, "Token expired");
      }
      let tokenRecord = {};
      if(isEnroll) {
        tokenRecord = user.services.password.enroll;
      } else {
        tokenRecord = user.services.password.reset;
      }
      const { when, email } = tokenRecord;
      let tokenLifetimeMs = Accounts._getPasswordResetTokenLifetimeMs();
      if (isEnroll) {
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

      const hashed = await hashPassword(newPassword);

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
        // - Forgetting about the reset token or enroll token that was just used
        // - Verifying their email, since they got the password reset via email.
        let affectedRecords = {};
        // if reason is enroll then check services.password.enroll.token field for affected records
        if(isEnroll) {
          affectedRecords = Meteor.users.update(
            {
              _id: user._id,
              'emails.address': email,
              'services.password.enroll.token': token
            },
            {$set: {'services.password.bcrypt': hashed,
                    'emails.$.verified': true},
              $unset: {'services.password.enroll': 1 }});
        } else {
          affectedRecords = Meteor.users.update(
            {
              _id: user._id,
              'emails.address': email,
              'services.password.reset.token': token
            },
            {$set: {'services.password.bcrypt': hashed,
                    'emails.$.verified': true},
              $unset: {'services.password.reset': 1 }});
        }
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

      if (Accounts._check2faEnabled?.(user)) {
        return {
          userId: user._id,
          error: Accounts._handleError(
            'Changed password, but user not logged in because 2FA is enabled',
            false,
            '2fa-enabled'
          ),
        };
      }

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
 * @param {Object} [extraParams] Optional additional params to be added to the verification url.
 *
 * @returns {Object} Object with {email, user, token, url, options} values.
 * @importFromPackage accounts-base
 */
Accounts.sendVerificationEmail = (userId, email, extraTokenData, extraParams) => {
  // XXX Also generate a link using which someone can delete this
  // account if they own said address but weren't those who created
  // this account.

  const {email: realEmail, user, token} =
    Accounts.generateVerificationToken(userId, email, extraTokenData);
  const url = Accounts.urls.verifyEmail(token, extraParams);
  const options = Accounts.generateOptionsForEmail(realEmail, user, url, 'verifyEmail');
  Email.send(options);
  if (Meteor.isDevelopment) {
    console.log(`\nVerification email URL: ${url}`);
  }
  return {email: realEmail, user, token, url, options};
};

// Take token from sendVerificationEmail, mark the email as verified,
// and log them in.
Meteor.methods({verifyEmail: async function (...args) {
  const token = args[0];
  return await Accounts._loginMethod(
    this,
    "verifyEmail",
    args,
    "password",
    () => {
      check(token, String);

      const user = Meteor.users.findOne(
        {'services.email.verificationTokens.token': token},
        {fields: {
          services: 1,
          emails: 1,
        }}
      );
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

      if (Accounts._check2faEnabled?.(user)) {
        return {
          userId: user._id,
          error: Accounts._handleError(
            'Email verified, but user not logged in because 2FA is enabled',
            false,
            '2fa-enabled'
          ),
        };
      }

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
Accounts.addEmailAsync = async (userId, newEmail, verified) => {
  check(userId, NonEmptyString);
  check(newEmail, NonEmptyString);
  check(verified, Match.Optional(Boolean));

  if (verified === void 0) {
    verified = false;
  }

  const user = await getUserByIdAsync(userId, {fields: {emails: 1}});

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

  // In the other updates below, we have to do another call to
  // checkForCaseInsensitiveDuplicates to make sure that no conflicting values
  // were added to the database in the meantime. We don't have to do this for
  // the case where the user is updating their email address to one that is the
  // same as before, but only different because of capitalization. Read the
  // big comment above to understand why.

  for (const email of (user.emails || [])) {
    if (caseInsensitiveRegExp.test(email.address)) {
      await Meteor.users.updateAsync({
        _id: user._id,
        'emails.address': email.address
      }, {$set: {
        'emails.$.address': newEmail,
        'emails.$.verified': verified
      }});
      return;
    }
  }

  // Perform a case insensitive check for duplicates before update
  Accounts._checkForCaseInsensitiveDuplicates('emails.address',
    'Email', newEmail, user._id);

  await Meteor.users.updateAsync({
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
    Accounts._checkForCaseInsensitiveDuplicates('emails.address',
      'Email', newEmail, user._id);
  } catch (ex) {
    // Undo update if the check fails
    await Meteor.users.updateAsync({_id: user._id},
      {$pull: {emails: {address: newEmail}}});
    throw ex;
  }
}

Accounts.addEmail = function (...args) {
  return Future.fromPromise(this.addEmailAsync(...args)).wait();
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

  const user = getUserById(userId, {fields: {_id: 1}});
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
const createUser = async options => {
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
    const hashed = await hashPassword(password);
    user.services.password = { bcrypt: hashed };
  }

  return Accounts._createUserCheckingDuplicates({ user, email, username, options });
};

// method for create user. Requests come from the client.
Meteor.methods({createUser: async function (...args) {
  const options = args[0];
  return await Accounts._loginMethod(
    this,
    "createUser",
    args,
    "password",
    async () => {
      // createUser() above does more checking.
      check(options, Object);
      if (Accounts._options.forbidClientAccountCreation)
        return {
          error: new Meteor.Error(403, "Signups forbidden")
        };

      const userId = await Accounts.createUserVerifyingEmail(options);

      // client gets logged in as the new user afterwards.
      return {userId: userId};
    }
  );
}});

/**
 * @summary Creates an user and sends an email if `options.email` is informed.
 * Then if the `sendVerificationEmail` option from the `Accounts` package is
 * enabled, you'll send a verification email if `options.password` is informed,
 * otherwise you'll send an enrollment email.
 * @locus Server
 * @param {Object} options The options object to be passed down when creating
 * the user
 * @param {String} options.username A unique name for this user.
 * @param {String} options.email The user's email address.
 * @param {String} options.password The user's password. This is __not__ sent in plain text over the wire.
 * @param {Object} options.profile The user's profile, typically including the `name` field.
 * @importFromPackage accounts-base
 * */
Accounts.createUserVerifyingEmail = async (options) => {
  options = { ...options };
  // Create user. result contains id and token.
  const userId = await createUser(options);
  // safety belt. createUser is supposed to throw on error. send 500 error
  // instead of sending a verification email with empty userid.
  if (! userId)
    throw new Error("createUser failed to insert new user");

  // If `Accounts._options.sendVerificationEmail` is set, register
  // a token to verify the user's primary email, and send it to
  // that address.
  if (options.email && Accounts._options.sendVerificationEmail) {
    if (options.password) {
      Accounts.sendVerificationEmail(userId, options.email);
    } else {
      Accounts.sendEnrollmentEmail(userId, options.email);
    }
  }

  return userId;
};

// Create user directly on the server.
//
// Unlike the client version, this does not log you in as this user
// after creation.
//
// returns Promise<userId> or throws an error if it can't create
//
// XXX add another argument ("server options") that gets sent to onCreateUser,
// which is always empty when called from the createUser method? eg, "admin:
// true", which we want to prevent the client from setting, but which a custom
// method calling Accounts.createUser could set?
//

Accounts.createUserAsync = async (options, callback) => {
  options = { ...options };

  // XXX allow an optional callback?
  if (callback) {
    throw new Error("Accounts.createUser with callback not supported on the server yet.");
  }

  return createUser(options);
};

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
  return Promise.await(Accounts.createUserAsync(options, callback));
};

///
/// PASSWORD-SPECIFIC INDEXES ON USERS
///
Meteor.users.createIndexAsync('services.email.verificationTokens.token',
                              { unique: true, sparse: true });
Meteor.users.createIndexAsync('services.password.reset.token',
                              { unique: true, sparse: true });
Meteor.users.createIndexAsync('services.password.enroll.token',
                              { unique: true, sparse: true });

(function () {
  var selectorFromUserQuery = function (user) {
    if (!user)
      throw new Meteor.Error(400, "Must pass a user property in request");
    if (_.keys(user).length !== 1)
      throw new Meteor.Error(400, "User property must have exactly one field");

    var selector;
    if (user.id)
      selector = {_id: user.id};
    else if (user.username)
      selector = {username: user.username};
    else if (user.email)
      selector = {"emails.address": user.email};
    else
      throw new Meteor.Error(400, "Must pass username, email, or id in request.user");

    return selector;
  };

  Meteor.methods({
    // @param request {Object} with fields:
    //   user: either {username: (username)}, {email: (email)}, or {id: (userId)}
    //   A: hex encoded int. the client's public key for this exchange
    // @returns {Object} with fields:
    //   identiy: string uuid
    //   salt: string uuid
    //   B: hex encoded int. server's public key for this exchange
    beginPasswordExchange: function (request) {
      var selector = selectorFromUserQuery(request.user);

      var user = Meteor.users.findOne(selector);
      if (!user)
        throw new Meteor.Error(403, "User not found");

      if (!user.services || !user.services.password ||
          !user.services.password.srp)
        throw new Meteor.Error(403, "User has no password set");

      var verifier = user.services.password.srp;
      var srp = new Meteor._srp.Server(verifier);
      var challenge = srp.issueChallenge({A: request.A});

      // save off results in the current session so we can verify them
      // later.
      this._sessionData.srpChallenge =
        { userId: user._id, M: srp.M, HAMK: srp.HAMK };

      return challenge;
    },

    changePassword: function (options) {
      if (!this.userId)
        throw new Meteor.Error(401, "Must be logged in");

      // If options.M is set, it means we went through a challenge with
      // the old password.

      if (!options.M /* could allow unsafe password changes here */) {
        throw new Meteor.Error(403, "Old password required.");
      }

      if (options.M) {
        var serialized = this._sessionData.srpChallenge;
        if (!serialized || serialized.M !== options.M)
          throw new Meteor.Error(403, "Incorrect password");
        if (serialized.userId !== this.userId)
          // No monkey business!
          throw new Meteor.Error(403, "Incorrect password");
        // Only can use challenges once.
        delete this._sessionData.srpChallenge;
      }

      var verifier = options.srp;
      if (!verifier && options.password) {
        verifier = Meteor._srp.generateVerifier(options.password);
      }
      if (!verifier || !verifier.identity || !verifier.salt ||
          !verifier.verifier)
        throw new Meteor.Error(400, "Invalid verifier");

      // XXX this should invalidate all login tokens other than the current one
      // (or it should assign a new login token, replacing existing ones)
      Meteor.users.update({_id: this.userId},
                          {$set: {'services.password.srp': verifier}});

      var ret = {passwordChanged: true};
      if (serialized)
        ret.HAMK = serialized.HAMK;
      return ret;
    },

    forgotPassword: function (options) {
      var email = options.email;
       if (!email)
        throw new Meteor.Error(400, "Need to set options.email");

      var user = Meteor.users.findOne({"emails.address": email});
      if (!user)
        throw new Meteor.Error(403, "User not found");

      var token = Meteor.uuid();
      var when = +(new Date);
      Meteor.users.update(user._id, {$set: {
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
    },

    resetPassword: function (token, newVerifier) {
      if (!token)
        throw new Meteor.Error(400, "Need to pass token");
      if (!newVerifier)
        throw new Meteor.Error(400, "Need to pass newVerifier");

      var user = Meteor.users.findOne({"services.password.reset.token": token});
      if (!user)
        throw new Meteor.Error(403, "Token expired");
      var email = user.services.password.reset.email;
      if (!_.include(_.pluck(user.emails || [], 'address'), email))
        throw new Meteor.Error(403, "Token has invalid email address");

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
               'emails.$.validated': true},
        $unset: {'services.password.reset': 1}
      });

      this.setUserId(user._id);
      return {token: stampedLoginToken.token, id: user._id};
    },

    validateEmail: function (token) {
      if (!token)
        throw new Meteor.Error(400, "Need to pass token");

      var user = Meteor.users.findOne({'emails.validationTokens.token': token});
      if (!user)
        throw new Meteor.Error(403, "Validate email link expired");

      // Log the user in with a new login token.
      var stampedLoginToken = Accounts._generateStampedLoginToken();

      // By including the token again in the query, we can use 'emails.$' in the
      // modifier to get a reference to the specific object in the emails
      // array. See
      // http://www.mongodb.org/display/DOCS/Updating/#Updating-The%24positionaloperator)
      // http://www.mongodb.org/display/DOCS/Updating#Updating-%24pull
      Meteor.users.update(
        {_id: user._id, 'emails.validationTokens.token': token}, {
          $set: {'emails.$.validated': true},
          $pull: {'emails.$.validationTokens': {token: token}},
          $push: {'services.resume.loginTokens': stampedLoginToken}});

      this.setUserId(user._id);
      return {token: stampedLoginToken.token, id: user._id};
    }
  });

  // send the user an email with a link that when opened marks that
  // address as validated
  Accounts.sendValidationEmail = function (userId, email) {
    // XXX Also generate a link using which someone can delete this
    // account if they own said address but weren't those who created
    // this account.

    // XXX if Meteor.Collection.update returned the number of updated records
    // like Mongo's update does, we could do this as a single update rather than
    // as a slower and racier read/modify/write
    var user = Meteor.users.findOne({_id: userId, 'emails.address': email});
    if (!user)
      throw new Meteor.Error(403, "Email address not found for validation");
    var stampedToken = {token: Meteor.uuid(), when: +(new Date)};
    Meteor.users.update({_id: userId, 'emails.address': email},
                        {$push: {'emails.$.validationTokens': stampedToken}});

    var validateEmailUrl = Accounts.urls.validateEmail(stampedToken.token);

    Email.send({
      to: email,
      from: Accounts.emailTemplates.from,
      subject: Accounts.emailTemplates.validateEmail.subject(user),
      text: Accounts.emailTemplates.validateEmail.text(user, validateEmailUrl)
    });
  };

  // send the user an email informing them that their account was created, with
  // a link that when opened both marks their email as validated and forces them
  // to choose their password. The email must be one of the addresses in the
  // user's emails field.
  Accounts.sendEnrollmentEmail = function (userId, email) {
    var token = Meteor.uuid();
    var when = +(new Date);
    Meteor.users.update(userId, {$set: {
      "services.password.reset": {
        token: token,
        email: email,
        when: when
      }
    }});

    var user = Meteor.users.findOne(userId);
    var enrollAccountUrl = Accounts.urls.enrollAccount(token);
    Email.send({
      to: email,
      from: Accounts.emailTemplates.from,
      subject: Accounts.emailTemplates.enrollAccount.subject(user),
      text: Accounts.emailTemplates.enrollAccount.text(user, enrollAccountUrl)
    });
  };

  // handler to login with password
  Accounts.registerLoginHandler(function (options) {
    if (!options.srp)
      return undefined; // don't handle
    if (!options.srp.M)
      throw new Meteor.Error(400, "Must pass M in options.srp");

    // we're always called from within a 'login' method, so this should
    // be safe.
    var currentInvocation = Meteor._CurrentInvocation.get();
    var serialized = currentInvocation._sessionData.srpChallenge;
    if (!serialized || serialized.M !== options.srp.M)
      throw new Meteor.Error(403, "Incorrect password");
    // Only can use challenges once.
    delete currentInvocation._sessionData.srpChallenge;

    var userId = serialized.userId;
    var user = Meteor.users.findOne(userId);
    // Was the user deleted since the start of this challenge?
    if (!user)
      throw new Meteor.Error(403, "User not found");
    var stampedLoginToken = Accounts._generateStampedLoginToken();
    Meteor.users.update(
      userId, {$push: {'services.resume.loginTokens': stampedLoginToken}});

    return {token: stampedLoginToken.token, id: userId, HAMK: serialized.HAMK};
  });

  // handler to login with plaintext password.
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
      throw new Meteor.Error(403, "User not found");

    if (!user.services || !user.services.password ||
        !user.services.password.srp)
      throw new Meteor.Error(403, "User has no password set");

    // Just check the verifier output when the same identity and salt
    // are passed. Don't bother with a full exchange.
    var verifier = user.services.password.srp;
    var newVerifier = Meteor._srp.generateVerifier(options.password, {
      identity: verifier.identity, salt: verifier.salt});

    if (verifier.verifier !== newVerifier.verifier)
      throw new Meteor.Error(403, "Incorrect password");

    var stampedLoginToken = Accounts._generateStampedLoginToken();
    Meteor.users.update(
      user._id, {$push: {'services.resume.loginTokens': stampedLoginToken}});

    return {token: stampedLoginToken.token, id: user._id};
  });


  Meteor.setPassword = function (userId, newPassword) {
    var user = Meteor.users.findOne(userId);
    if (!user)
      throw new Meteor.Error(403, "User not found");
    var newVerifier = Meteor._srp.generateVerifier(newPassword);

    Meteor.users.update({_id: user._id}, {
      $set: {'services.password.srp': newVerifier}});
  };


  ////////////
  // Creating users:


  // Shared createUser function called from the createUser method, both
  // if originates in client or server code. Calls user provided hooks,
  // does the actual user insertion.
  //
  // returns an object with id: userId, and (if options.generateLoginToken is
  // set) token: loginToken.
  var createUser = function (options, extra) {
    extra = extra || {};
    var username = options.username;
    var email = options.email;
    if (!username && !email)
      throw new Meteor.Error(400, "Need to set a username or email");

    if (username && Meteor.users.findOne({username: username}))
      throw new Meteor.Error(403, "User already exists with username " + username);
    if (email && Meteor.users.findOne({"emails.address": email})) {
      throw new Meteor.Error(403, "User already exists with email " + email);
    }

    // Raw password. The meteor client doesn't send this, but a DDP
    // client that didn't implement SRP could send this. This should
    // only be done over SSL.
    if (options.password) {
      if (options.srp)
        throw new Meteor.Error(400, "Don't pass both password and srp in options");
      options.srp = Meteor._srp.generateVerifier(options.password);
    }

    var user = {services: {}};
    if (options.srp)
      user.services.password = {srp: options.srp}; // XXX validate verifier
    if (username)
      user.username = username;
    if (email)
      user.emails = [{address: email, validated: false}];

    return Accounts.insertUserDoc(options, extra, user);
  };

  // method for create user. Requests come from the client.
  Meteor.methods({
    createUser: function (options, extra) {
      options = _.clone(options);
      options.generateLoginToken = true;
      if (Accounts._options.forbidSignups)
        throw new Meteor.Error(403, "Signups forbidden");

      // Create user. result contains id and token.
      var result = createUser(options, extra);
      // safety belt. createUser is supposed to throw on error. send 500 error
      // instead of sending a validation email with empty userid.
      if (!result.id)
        throw new Error("createUser failed to insert new user");

      // If `Accounts._options.validateEmails` is set, register
      // a token to validate the user's primary email, and send it to
      // that address.
      if (options.email && Accounts._options.validateEmails)
        Accounts.sendValidationEmail(result.id, options.email);

      // client gets logged in as the new user afterwards.
      this.setUserId(result.id);
      return result;
    }
  });

  // Create user directly on the server.
  //
  // Unlike the client version, this does not log you in as this user
  // after creation.
  //
  // returns userId or throws an error if it can't create
  Accounts.createUser = function (options, extra, callback) {
    options = _.clone(options);
    options.generateLoginToken = false;
    if (typeof extra === "function") {
      callback = extra;
      extra = {};
    }

    // XXX allow an optional callback?
    if (callback) {
      throw new Error("Meteor.createUser with callback not supported on the server yet.");
    }

    var userId = createUser(options, extra).id;

    // send email if the user has an email and no password
    var user = Meteor.users.findOne(userId);
    if (
        // user has email address
      (user && user.emails && user.emails.length &&
       user.emails[0].address) &&
        // and does not have a password
      !(user.services && user.services.password &&
        user.services.password.srp)) {

      var email = user.emails[0].address;
      Accounts.sendEnrollmentEmail(userId, email);
    }

    return userId;
  };




})();

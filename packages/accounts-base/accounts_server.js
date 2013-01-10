(function () {
  ///
  /// LOGIN HANDLERS
  ///

  Meteor.methods({
    // @returns {Object|null}
    //   If successful, returns {token: reconnectToken, id: userId}
    //   If unsuccessful (for example, if the user closed the oauth login popup),
    //     returns null
    login: function(options) {
      var result = tryAllLoginHandlers(options);
      if (result !== null)
        this.setUserId(result.id);
      return result;
    },

    logout: function() {
      this.setUserId(null);
    }
  });

  Accounts._loginHandlers = [];

  // Try all of the registered login handlers until one of them doesn't return
  // `undefined`, meaning it handled this call to `login`. Return that return
  // value, which ought to be a {id/token} pair.
  var tryAllLoginHandlers = function (options) {
    var result = undefined;

    _.find(Accounts._loginHandlers, function(handler) {

      var maybeResult = handler(options);
      if (maybeResult !== undefined) {
        result = maybeResult;
        return true;
      } else {
        return false;
      }
    });

    if (result === undefined) {
      throw new Meteor.Error(400, "Unrecognized options for login request");
    } else {
      return result;
    }
  };

  // @param handler {Function} A function that receives an options object
  // (as passed as an argument to the `login` method) and returns one of:
  // - `undefined`, meaning don't handle;
  // - {id: userId, token: *}, if the user logged in successfully.
  // - throw an error, if the user failed to log in.
  Accounts.registerLoginHandler = function(handler) {
    Accounts._loginHandlers.push(handler);
  };

  // support reconnecting using a meteor login token
  Accounts._generateStampedLoginToken = function () {
    return {token: Meteor.uuid(), when: +(new Date)};
  };

  Accounts.registerLoginHandler(function(options) {
    if (options.resume) {
      var user = Meteor.users.findOne(
        {"services.resume.loginTokens.token": options.resume});
      if (!user)
        throw new Meteor.Error(403, "Couldn't find login token");

      return {
        token: options.resume,
        id: user._id
      };
    } else {
      return undefined;
    }
  });


  ///
  /// CURRENT USER
  ///
  Meteor.userId = function () {
    // This function only works if called inside a method. In theory, it
    // could also be called from publish statements, since they also
    // have a userId associated with them. However, given that publish
    // functions aren't reactive, using any of the infomation from
    // Meteor.user() in a publish function will always use the value
    // from when the function first runs. This is likely not what the
    // user expects. The way to make this work in a publish is to do
    // Meteor.find(this.userId()).observe and recompute when the user
    // record changes.
    var currentInvocation = Meteor._CurrentInvocation.get();
    if (!currentInvocation)
      throw new Error("Meteor.userId can only be invoked in method calls. Use this.userId in publish functions.");
    return currentInvocation.userId;
  };

  Meteor.user = function () {
    var userId = Meteor.userId();
    if (!userId)
      return null;
    return Meteor.users.findOne(userId);
  };

  ///
  /// CREATE USER HOOKS
  ///
  var onCreateUserHook = null;
  Accounts.onCreateUser = function (func) {
    if (onCreateUserHook)
      throw new Error("Can only call onCreateUser once");
    else
      onCreateUserHook = func;
  };

  // XXX see comment on Accounts.createUser in passwords_server about adding a
  // second "server options" argument.
  var defaultCreateUserHook = function (options, user) {
    if (options.profile)
      user.profile = options.profile;
    return user;
  };
  Accounts.insertUserDoc = function (options, user) {
    // add created at timestamp (and protect passed in user object from
    // modification)
    user = _.extend({createdAt: +(new Date)}, user);

    var result = {};
    if (options.generateLoginToken) {
      var stampedToken = Accounts._generateStampedLoginToken();
      result.token = stampedToken.token;
      Meteor._ensure(user, 'services', 'resume');
      if (_.has(user.services.resume, 'loginTokens'))
        user.services.resume.loginTokens.push(stampedToken);
      else
        user.services.resume.loginTokens = [stampedToken];
    }

    var fullUser;
    if (onCreateUserHook) {
      fullUser = onCreateUserHook(options, user);

      // This is *not* part of the API. We need this because we can't isolate
      // the global server environment between tests, meaning we can't test
      // both having a create user hook set and not having one set.
      if (fullUser === 'TEST DEFAULT HOOK')
        fullUser = defaultCreateUserHook(options, user);
    } else {
      fullUser = defaultCreateUserHook(options, user);
    }

    _.each(validateNewUserHooks, function (hook) {
      if (!hook(fullUser))
        throw new Meteor.Error(403, "User validation failed");
    });

    try {
      result.id = Meteor.users.insert(fullUser);
    } catch (e) {
      // XXX string parsing sucks, maybe
      // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
      if (e.name !== 'MongoError') throw e;
      var match = e.err.match(/^E11000 duplicate key error index: ([^ ]+)/);
      if (!match) throw e;
      if (match[1].indexOf('$emails.address') !== -1)
        throw new Meteor.Error(403, "Email already exists.");
      if (match[1].indexOf('username') !== -1)
        throw new Meteor.Error(403, "Username already exists.");
      // XXX better error reporting for services.facebook.id duplicate, etc
      throw e;
    }

    return result;
  };

  var validateNewUserHooks = [];
  Accounts.validateNewUser = function (func) {
    validateNewUserHooks.push(func);
  };


  ///
  /// MANAGING USER OBJECTS
  ///

  // Updates or creates a user after we authenticate with a 3rd party.
  //
  // @param serviceName {String} Service name (eg, twitter).
  // @param serviceData {Object} Data to store in the user's record
  //        under services[serviceName]. Must include an "id" field
  //        which is a unique identifier for the user in the service.
  // @param options {Object, optional} Other options to pass to insertUserDoc
  //        (eg, profile)
  // @returns {Object} Object with token and id keys, like the result
  //        of the "login" method.
  Accounts.updateOrCreateUserFromExternalService = function(
    serviceName, serviceData, options) {
    options = _.clone(options || {});

    if (serviceName === "password" || serviceName === "resume")
      throw new Error(
        "Can't use updateOrCreateUserFromExternalService with internal service "
          + serviceName);
    if (!_.has(serviceData, 'id'))
      throw new Error(
        "Service data for service " + serviceName + " must include id");

    // Look for a user with the appropriate service user id.
    var selector = {};
    selector["services." + serviceName + ".id"] = serviceData.id;
    var user = Meteor.users.findOne(selector);

    if (user) {
      // We *don't* process options (eg, profile) for update, but we do replace
      // the serviceData (eg, so that we keep an unexpired access token and
      // don't cache old email addresses in serviceData.email).
      // XXX provide an onUpdateUser hook which would let apps update
      //     the profile too
      var stampedToken = Accounts._generateStampedLoginToken();
      var setAttrs = {};
      _.each(serviceData, function(value, key) {
        setAttrs["services." + serviceName + "." + key] = value;
      });

      // XXX Maybe we should re-use the selector above and notice if the update
      //     touches nothing?
      Meteor.users.update(
        user._id,
        {$set: setAttrs,
         $push: {'services.resume.loginTokens': stampedToken}});
      return {token: stampedToken.token, id: user._id};
    } else {
      // Create a new user with the service data. Pass other options through to
      // insertUserDoc.
      user = {services: {}};
      user.services[serviceName] = serviceData;
      options.generateLoginToken = true;
      return Accounts.insertUserDoc(options, user);
    }
  };


  ///
  /// PUBLISHING DATA
  ///

  // Publish the current user's record to the client.
  Meteor.publish(null, function() {
    if (this.userId)
      return Meteor.users.find(
        {_id: this.userId},
        {fields: {profile: 1, username: 1, emails: 1}});
    else {
      return null;
    }
  }, {is_auto: true});

  // If autopublish is on, also publish everyone else's user record.
  Meteor.default_server.onAutopublish(function () {
    var handler = function () {
      return Meteor.users.find(
        {}, {fields: {profile: 1, username: 1}});
    };
    Meteor.default_server.publish(null, handler, {is_auto: true});
  });

  // Publish all login service configuration fields other than secret.
  Meteor.publish("meteor.loginServiceConfiguration", function () {
    return Accounts.loginServiceConfiguration.find({}, {fields: {secret: 0}});
  }, {is_auto: true}); // not techincally autopublish, but stops the warning.

  // Allow a one-time configuration for a login service. Modifications
  // to this collection are also allowed in insecure mode.
  Meteor.methods({
    "configureLoginService": function(options) {
      // Don't let random users configure a service we haven't added yet (so
      // that when we do later add it, it's set up with their configuration
      // instead of ours).
      if (!Accounts[options.service])
        throw new Meteor.Error(403, "Service unknown");
      if (Accounts.loginServiceConfiguration.findOne({service: options.service}))
        throw new Meteor.Error(403, "Service " + options.service + " already configured");
      Accounts.loginServiceConfiguration.insert(options);
    }
  });


  ///
  /// RESTRICTING WRITES TO USER OBJECTS
  ///

  Meteor.users.allow({
    // clients can modify the profile field of their own document, and
    // nothing else.
    update: function (userId, docs, fields, modifier) {
      // if there is more than one doc, at least one of them isn't our
      // user record.
      if (docs.length !== 1)
        return false;
      // make sure it is our record
      var user = docs[0];
      if (user._id !== userId)
        return false;

      // user can only modify the 'profile' field. sets to multiple
      // sub-keys (eg profile.foo and profile.bar) are merged into entry
      // in the fields list.
      if (fields.length !== 1 || fields[0] !== 'profile')
        return false;

      return true;
    },
    fetch: ['_id'] // we only look at _id.
  });

  /// DEFAULT INDEXES ON USERS
  Meteor.users._ensureIndex('username', {unique: 1, sparse: 1});
  Meteor.users._ensureIndex('emails.address', {unique: 1, sparse: 1});
  Meteor.users._ensureIndex('services.resume.loginTokens.token',
                            {unique: 1, sparse: 1});
}) ();


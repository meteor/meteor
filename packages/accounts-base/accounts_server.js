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

  // Try all of the registered login handlers until one of them
  // doesn't return `undefined` (NOT null), meaning it handled this
  // call to `login`. Return that return value.
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
  // - `null`, meaning the user didn't actually log in;
  // - {id: userId, accessToken: *}, if the user logged in successfully.
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

  var defaultCreateUserHook = function (options, extra, user) {
    if (!_.isEmpty(
      _.intersection(
        _.keys(extra),
        ['services', 'username', 'email', 'emails'])))
      throw new Meteor.Error(400, "Disallowed fields in extra");

    if (Accounts._options.requireEmail &&
        (!user.emails || !user.emails.length))
      throw new Meteor.Error(400, "Email address required.");

    if (Accounts._options.requireUsername &&
        !user.username)
      throw new Meteor.Error(400, "Username required.");


    return _.extend(user, extra);
  };
  Accounts.insertUserDoc = function (options, extra, user) {
    // add created at timestamp (and protect passed in user object from
    // modification)
    user = _.extend({createdAt: +(new Date)}, user);

    var fullUser;

    if (onCreateUserHook) {
      fullUser = onCreateUserHook(options, extra, user);

      // This is *not* part of the API. We need this because we can't isolate
      // the global server environment between tests, meaning we can't test
      // both having a create user hook set and not having one set.
      if (fullUser === 'TEST DEFAULT HOOK')
        fullUser = defaultCreateUserHook(options, extra, user);
    } else {
      fullUser = defaultCreateUserHook(options, extra, user);
    }

    _.each(validateNewUserHooks, function (hook) {
      if (!hook(fullUser))
        throw new Meteor.Error(403, "User validation failed");
    });

    // check for existing user with duplicate email or username.
    if (fullUser.username &&
        Meteor.users.findOne({username: fullUser.username}))
      throw new Meteor.Error(403, "Username already exists.");

    if (fullUser.emails) {
      var addresses = _.map(fullUser.emails, function (e) {
        return e.address; });
      if (Meteor.users.findOne({'emails.address': {$in: addresses}}))
        throw new Meteor.Error(403, "Email already exists.");
    }

    var result = {};
    if (options.generateLoginToken) {
      var stampedToken = Accounts._generateStampedLoginToken();
      result.token = stampedToken.token;
      Meteor._ensure(fullUser, 'services', 'resume');
      if (_.has(fullUser.services.resume, 'loginTokens'))
        fullUser.services.resume.loginTokens.push(stampedToken);
      else
        fullUser.services.resume.loginTokens = [stampedToken];
    }

    result.id = Meteor.users.insert(fullUser);

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
  // @param extra {Object, optional} Any additional fields to place on the user
  //        object
  // @returns {Object} Object with token and id keys, like the result
  //        of the "login" method.
  Accounts.updateOrCreateUserFromExternalService = function(
    serviceName, serviceData, extra) {
    extra = extra || {};

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
      // don't overwrite existing fields
      // XXX subobjects (aka 'profile', 'services')?
      var newKeys = _.difference(_.keys(extra), _.keys(user));
      var newAttrs = _.pick(extra, newKeys);
      var stampedToken = Accounts._generateStampedLoginToken();
      var result = {token: stampedToken.token};
      Meteor.users.update(
        user._id,
        {$set: newAttrs, $push: {'services.resume.loginTokens': stampedToken}});
      result.id = user._id;
      return result;
    } else {
      // Create a new user.
      var servicesClause = {};
      servicesClause[serviceName] = serviceData;
      var insertOptions = {services: servicesClause, generateLoginToken: true};
      // Build a user doc; clone to make sure sure mutating
      // insertOptions.services doesn't affect user.services or vice versa.
      user = {services: JSON.parse(JSON.stringify(servicesClause))};
      return Accounts.insertUserDoc(insertOptions, extra, user);
    }
  };


  ///
  /// PUBLISHING DATA
  ///

  // Publish the current user's record to the client.
  // XXX This should just be a universal subscription, but we want to know when
  //     we've gotten the data after a 'login' method, which currently requires
  //     us to unsub, sub, and wait for onComplete. This is wasteful because
  //     we're actually guaranteed to have the data by the time that 'login'
  //     returns. But we don't expose a callback to Meteor.apply which lets us
  //     know when the data has been processed (ie, quiescence, or at least
  //     partial quiescence).
  Meteor.publish("meteor.currentUser", function() {
    if (this.userId)
      return Meteor.users.find({_id: this.userId},
                               {fields: {profile: 1, username: 1, emails: 1}});
    else {
      this.complete();
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
    return Accounts.configuration.find({}, {fields: {secret: 0}});
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
      if (Accounts.configuration.findOne({service: options.service}))
        throw new Meteor.Error(403, "Service " + options.service + " already configured");
      Accounts.configuration.insert(options);
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
    fields: ['_id'] // we only look at _id.
  });

}) ();


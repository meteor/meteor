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

  Meteor.accounts._loginHandlers = [];

  // Try all of the registered login handlers until one of them
  // doesn't return `undefined` (NOT null), meaning it handled this
  // call to `login`. Return that return value.
  var tryAllLoginHandlers = function (options) {
    var result = undefined;

    _.find(Meteor.accounts._loginHandlers, function(handler) {

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
  Meteor.accounts.registerLoginHandler = function(handler) {
    Meteor.accounts._loginHandlers.push(handler);
  };

  // support reconnecting using a meteor login token
  Meteor.accounts.registerLoginHandler(function(options) {
    if (options.resume) {
      var loginToken = Meteor.accounts._loginTokens
            .findOne({_id: options.resume});
      if (!loginToken)
        throw new Meteor.Error(403, "Couldn't find login token");

      return {
        token: loginToken._id,
        id: loginToken.userId
      };
    } else {
      return undefined;
    }
  });


  ///
  /// CREATE USER HOOKS
  ///
  var onCreateUserHook = null;
  Meteor.accounts.onCreateUser = function (func) {
    if (onCreateUserHook)
      throw new Error("Can only call onCreateUser once");
    else
      onCreateUserHook = func;
  };

  var defaultCreateUserHook = function (options, extra, user) {
    if (!_.isEmpty(
      _.intersection(
        _.keys(extra),
        ['services', 'private', 'username', 'email', 'emails'])))
      throw new Meteor.Error(400, "Disallowed fields in extra");

    if (Meteor.accounts._options.requireEmail &&
        (!user.emails || !user.emails.length))
      throw new Meteor.Error(400, "Email address required.");

    if (Meteor.accounts._options.requireUsername &&
        !user.username)
      throw new Meteor.Error(400, "Username required.");


    return _.extend(user, extra);
  };
  Meteor.accounts.onCreateUserHook = function (options, extra, user) {
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
      if (!hook(user))
        throw new Meteor.Error(403, "User validation failed");
    });

    return fullUser;
  };

  var validateNewUserHooks = [];
  Meteor.accounts.validateNewUser = function (func) {
    validateNewUserHooks.push(func);
  };


  ///
  /// MANAGING USER OBJECTS
  ///

  // Updates or creates a user after we authenticate with a 3rd party
  //
  // @param options {Object}
  //   - email (optional)
  //   - services {Object} e.g. {facebook: {id: (facebook user id), ...}}
  // @param extra {Object, optional} Any additional fields to place on the user objet
  // @returns {String} userId
  Meteor.accounts.updateOrCreateUser = function(options, extra) {
    extra = extra || {};

    var updateUserData = function() {
      // don't overwrite existing fields
      var newKeys = _.without(_.keys(extra), _.keys(user));
      var newAttrs = _.pick(extra, newKeys);
      Meteor.users.update(user, {$set: newAttrs});
    };

    if (_.keys(options.services).length > 0) {
      if (_.keys(options.services).length > 1) {
        throw new Error("Can't pass more than one service to updateOrCreateUser");
      }
      var serviceName = _.keys(options.services)[0];
    }

    var email = options.email;
    var userByEmail = email && Meteor.users.findOne({emails: email});
    var user;
    if (userByEmail) {

      // If we know about this email address that is our user.
      // Update the information from this service.
      user = userByEmail;
      if (options.services && (!user.services || !user.services[serviceName])) {
        var attrs = {};
        attrs["services." + serviceName] = options.services[serviceName];

        // XXX we will probably also need a hook for updating users,
        // similar to Meteor.accounts.onCreateUser
        Meteor.users.update(user, {$set: attrs});
      }

      updateUserData();
      return user._id;
    } else if (options.services) {

      // If not, look for a user with the appropriate service user id.
      // Update the user's email.
      var selector = {};
      selector["services." + serviceName + ".id"] = options.services[serviceName].id;
      var userByServiceUserId = Meteor.users.findOne(selector);
      if (userByServiceUserId) {
        user = userByServiceUserId;
        if (email && user.emails.indexOf(email) === -1) {
          // The user may have changed the email address associated with
          // this service. Store the new one in addition to the old one.

          // XXX we will probably also need a hook for updating users,
          // similar to Meteor.accounts.onCreateUser
          Meteor.users.update(user, {$push: {emails: email}});
        }

        updateUserData();
        return user._id;
      } else {

        // Create a new user
        var attrs = {};
        attrs[serviceName] = options.services[serviceName];
        var user = {
          emails: (email ? [email] : []),
          services: attrs
        };
        user = Meteor.accounts.onCreateUserHook(options, extra, user);
        return Meteor.users.insert(user);
      }
    }
  };


  ///
  /// PUBLISHING USER OBJECTS
  ///

  // Always publish the current user's record to the client.
  Meteor.publish(null, function() {
    if (this.userId())
      return Meteor.users.find({_id: this.userId()},
                               {fields: {services: 0, private: 0}});
    else
      return null;
  }, {is_auto: true});

  // If autopublish is on, also publish everyone else's user record.
  Meteor.default_server.onAutopublish(function () {
    var handler = function () {
      return Meteor.users.find(
        {}, {fields: {services: 0, private: 0, emails: 0}});
    };
    Meteor.default_server.publish(null, handler, {is_auto: true});
  });
}) ();


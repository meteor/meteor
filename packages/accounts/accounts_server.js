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
      throw new Meteor.Error("Unrecognized options for login request");
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
        throw new Meteor.Error("Couldn't find login token");

      return {
        token: loginToken._id,
        id: loginToken.userId
      };
    } else {
      return undefined;
    }
  });


  ///
  /// MANAGING USER OBJECTS
  ///

  // Updates or creates a user after we authenticate with a 3rd party
  //
  // @param email {String} The user's email
  // @param userData {Object} attributes to store directly on the user object
  // @param serviceName {String} e.g. 'facebook' or 'google'
  // @param serviceUserId {?} user id in 3rd party service
  // @param serviceData {Object} attributes to store on the user record's
  //   specific service subobject
  // @returns {String} userId
  Meteor.accounts.updateOrCreateUser = function(email,
                                                userData,
                                                serviceName,
                                                serviceUserId,
                                                serviceData) {
    var updateUserData = function() {
      // don't overwrite existing fields
      var newKeys = _.without(_.keys(userData), _.keys(user));
      var newAttrs = _.pick(userData, newKeys);
      Meteor.users.update(user, {$set: newAttrs});
    };

    if (!email)
      throw new Meteor.Error("We don't yet support email-less users");

    var userByEmail = Meteor.users.findOne({emails: email});
    var user;
    if (userByEmail) {

      // If we know about this email address that is our user.
      // Update the information from this service.
      user = userByEmail;
      if (!user.services || !user.services[serviceName]) {
        var attrs = {};
        attrs["services." + serviceName] = _.extend(
          {id: serviceUserId}, serviceData);
        Meteor.users.update(user, {$set: attrs});
      }

      updateUserData();
      return user._id;
    } else {

      // If not, look for a user with the appropriate service user id.
      // Update the user's email.
      var selector = {};
      selector["services." + serviceName + ".id"] = serviceUserId;
      var userByServiceUserId = Meteor.users.findOne(selector);
      if (userByServiceUserId) {
        user = userByServiceUserId;
        if (user.emails.indexOf(email) === -1) {
          // The user may have changed the email address associated with
          // this service. Store the new one in addition to the old one.
          Meteor.users.update(user, {$push: {emails: email}});
        }

        updateUserData();
        return user._id;
      } else {

        // Create a new user
        var attrs = {};
        attrs[serviceName] = _.extend({id: serviceUserId}, serviceData);
        return Meteor.users.insert(_.extend({}, userData, {
          emails: [email],
          services: attrs
        }));
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


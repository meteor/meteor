(function () {
  // Updates or creates a user after we authenticate with a 3rd party
  // @param serviceName {String} e.g. 'facebook' or 'google'
  // @param serviceUserId {?} user id in 3rd party service
  // @param more {Object} additional attributes to store on the user record
  // @returns {String} userId
  Meteor.accounts.updateOrCreateUser = function(email,
                                                serviceName,
                                                serviceUserId,
                                                more) {

    var userByEmail = Meteor.users.findOne({emails: email});
    if (userByEmail) {

      // If we know about this email address that is our user.
      // Update the information from this service.
      var user = userByEmail;
      if (!user.services || !user.services[serviceName]) {
        var attrs = {};
        attrs["services." + serviceName] = _.extend(
          {id: serviceUserId}, more);
        Meteor.users.update(user, {$set: attrs});
      }
      return user._id;
    } else {

      // If not, look for a user with the appropriate service user id.
      // Update the user's email.
      var selector = {};
      selector["services." + serviceName + ".id"] = serviceUserId;
      var userByServiceUserId = Meteor.users.findOne(selector);
      if (userByServiceUserId) {
        var user = userByServiceUserId;
        if (user.emails.indexOf(email) === -1) {
          // The user may have changed the email address associated with
          // this service. Store the new one in addition to the old one.
          Meteor.users.update(user, {$push: {emails: email}});
        }
        return user._id;
      } else {

        // Create a new user
        var attrs = {};
        attrs[serviceName] = _.extend({id: serviceUserId}, more);
        return Meteor.users.insert({
          emails: [email],
          services: attrs
        });
      }
    }
  };

  Meteor.accounts._loginHandlers = [];

  // @param handler {Function} A function that receives an options object
  // (as passed as an argument to the `login` method) and returns one of:
  // - `undefined`, meaning don't handle;
  // - `null`, meaning the user didn't actually log in;
  // - {id: userId, accessToken: *}, if the user logged in successfully.
  Meteor.accounts.registerLoginHandler = function(handler) {
    Meteor.accounts._loginHandlers.push(handler);
  };

  Meteor.methods({
    // @returns {Object|null}
    //   If successful, returns {token: reconnectToken, id: userId}
    //   If unsuccessful (for example, if the user closed the oauth login popup),
    //   returns null
    login: function(options) {
      if (options.resume) {
        var loginToken = Meteor.accounts._loginTokens
              .findOne({_id: options.resume});
        if (!loginToken)
          throw new Meteor.Error("Couldn't find login token");
        this.setUserId(loginToken.userId);

        return {
          token: loginToken,
          id: this.userId()
        };
      } else {
        var result = tryAllLoginHandlers(options);
        if (result !== null)
          this.setUserId(result.id);
        return result;
      }
    },

    logout: function() {
      this.setUserId(null);
    }
  });

  // Try all of the registered login handlers until one of them doesn't
  // return `undefined`, meaning it handled this call to `login`. Return
  // that return value.
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
}) ();


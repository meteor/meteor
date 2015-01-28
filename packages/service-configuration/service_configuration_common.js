if (typeof ServiceConfiguration === 'undefined') {
  ServiceConfiguration = {};
}


// Table containing documents with configuration options for each
// login service
ServiceConfiguration.configurations = new Mongo.Collection(
  "meteor_accounts_loginServiceConfiguration", {
    _preventAutopublish: true,
    connection: Meteor.isClient ? Accounts.connection : Meteor.connection
  });
// Leave this collection open in insecure mode. In theory, someone could
// hijack your oauth connect requests to a different endpoint or appId,
// but you did ask for 'insecure'. The advantage is that it is much
// easier to write a configuration wizard that works only in insecure
// mode.

// Only one configuration should ever exist for each service.
try {
  ServiceConfiguration.configurations._ensureIndex(
      { "service": 1 },
      { unique: true }
  );
} catch (e) {
  throw new Error(
      "The service-configuration package persists configuration in the meteor_accounts_loginServiceConfiguration"
      + " collection in MongoDB. As each service should have exactly one configuration, Meteor automatically creates a"
      + " MongoDB index with a unique constraint on the meteor_accounts_loginServiceConfiguration collection. The"
      + " _ensureIndex command which creates that index is currently failing.\n\n"
      + "Meteor versions <= 1.0.3.1 did not create this index. If you recently upgraded and are seeing this error"
      + " message for the first time, please check your meteor_accounts_loginServiceConfiguration collection for"
      + " multiple configuration entries for the same service and delete configuration entries until there is no more"
      + " than one configuration entry per service.\n\n"
      + "If the meteor_accounts_loginServiceConfiguration collection looks fine, the _ensureIndex command is failing"
      + " for some other reason.\n\n"
      + "For more information on this history of this issue, please see https://github.com/meteor/meteor/pull/3514.\n"
      + e
  );
}

// Thrown when trying to use a login service which is not configured
ServiceConfiguration.ConfigError = function (serviceName) {
  if (Meteor.isClient && !Accounts.loginServicesConfigured()) {
    this.message = "Login service configuration not yet loaded";
  } else if (serviceName) {
    this.message = "Service " + serviceName + " not configured";
  } else {
    this.message = "Service not configured";
  }
};
ServiceConfiguration.ConfigError.prototype = new Error();
ServiceConfiguration.ConfigError.prototype.name = 'ServiceConfiguration.ConfigError';

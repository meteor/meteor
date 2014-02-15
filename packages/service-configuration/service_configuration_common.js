if (typeof ServiceConfiguration === 'undefined') {
  ServiceConfiguration = {};
}


// Table containing documents with configuration options for each
// login service
ServiceConfiguration.configurations = new Meteor.Collection(
  "meteor_accounts_loginServiceConfiguration", {
    _preventAutopublish: true,
    connection: Meteor.isClient ? Accounts.connection : Meteor.connection
  });
// Leave this collection open in insecure mode. In theory, someone could
// hijack your oauth connect requests to a different endpoint or appId,
// but you did ask for 'insecure'. The advantage is that it is much
// easier to write a configuration wizard that works only in insecure
// mode.


// Thrown when trying to use a login service which is not configured
ServiceConfiguration.ConfigError = function(description) {
  this.message = description;
};
ServiceConfiguration.ConfigError.prototype = new Error();
ServiceConfiguration.ConfigError.prototype.name = 'ServiceConfiguration.ConfigError';

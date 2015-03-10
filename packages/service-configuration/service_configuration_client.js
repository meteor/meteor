///
/// LOGIN SERVICES
///

var serviceConfigurations =
  Accounts.connection.subscribe("meteor.loginServiceConfiguration");

// A reactive function returning whether the loginServiceConfiguration
// subscription is ready. Used by accounts-ui to hide the login button
// until we have all the configuration loaded
//
ServiceConfiguration.servicesConfigured = function () {
  return serviceConfigurations.ready();
};

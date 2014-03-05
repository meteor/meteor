MeteorDeveloperAccounts = {};

MeteorDeveloperAccounts._server = "https://www.meteor.com";

// Options are:
//  - developerAccountsServer: defaults to "https://www.meteor.com"
MeteorDeveloperAccounts._config = function (options) {
  if (options.developerAccountsServer) {
    MeteorDeveloperAccounts._server = options.developerAccountsServer;
  }
};

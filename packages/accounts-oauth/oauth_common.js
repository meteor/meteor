Accounts.oauth = {};

var services = {};

// Helper for registering OAuth based accounts packages.
// On the server, adds an index to the user collection.
Accounts.oauth.registerService = function (name) {
  if (_.has(services, name))
    throw new Error("Duplicate service: " + name);
  services[name] = true;

  if (Meteor.server) {
    // Accounts.updateOrCreateUserFromExternalService does a lookup by this id,
    // so this should be a unique index. You might want to add indexes for other
    // fields returned by your service (eg services.github.login) but you can do
    // that in your app.
    Meteor.users._ensureIndex('services.' + name + '.id',
                              {unique: 1, sparse: 1});
  }
};

Accounts.oauth.serviceNames = function () {
  return _.keys(services);
};

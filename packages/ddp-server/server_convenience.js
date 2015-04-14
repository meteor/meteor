// Only create a server if we are in an environment with a HTTP server
// (as opposed to, eg, a command-line tool).
//
// Note: this whole conditional is a total hack to get around the fact that this
// package logically should be split into a ddp-client and ddp-server package;
// see https://github.com/meteor/meteor/issues/3452
//
// Until we do that, this conditional (and the weak dependency on webapp that
// should really be a strong dependency of the ddp-server package) allows you to
// build projects which use `ddp` in Node without wanting to run a DDP server
// (ie, allows you to act as if you were using the nonexistent `ddp-client`
// server package).
if (Package.webapp) {
  if (process.env.DDP_DEFAULT_CONNECTION_URL) {
    __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL =
      process.env.DDP_DEFAULT_CONNECTION_URL;
  }

  Meteor.server = new Server;

  Meteor.refresh = function (notification) {
    DDPServer._InvalidationCrossbar.fire(notification);
  };

  // Proxy the public methods of Meteor.server so they can
  // be called directly on Meteor.
  _.each(['publish', 'methods', 'call', 'apply', 'onConnection'],
         function (name) {
           Meteor[name] = _.bind(Meteor.server[name], Meteor.server);
         });
} else {
  // No server? Make these empty/no-ops.
  Meteor.server = null;
  Meteor.refresh = function (notification) {
  };

  // Make these empty/no-ops too, so that non-webapp apps can still
  // depend on/use packages that use those functions.
  _.each(['publish', 'methods', 'onConnection'],
      function (name) {
        Meteor[name] = function () { };
      });
}

// Meteor.server used to be called Meteor.default_server. Provide
// backcompat as a courtesy even though it was never documented.
// XXX COMPAT WITH 0.6.4
Meteor.default_server = Meteor.server;

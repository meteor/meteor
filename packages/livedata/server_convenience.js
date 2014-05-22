// Only create a server if we are in an environment with a HTTP server
// (as opposed to, eg, a command-line tool).
//
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
  _.each(['publish', 'methods', 'call', 'apply', 'onConnection'],
    function (name) {
      Meteor[name] = function(){};
    });
}

// Meteor.server used to be called Meteor.default_server. Provide
// backcompat as a courtesy even though it was never documented.
// XXX COMPAT WITH 0.6.4
Meteor.default_server = Meteor.server;

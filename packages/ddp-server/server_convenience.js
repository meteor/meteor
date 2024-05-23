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
_.each(
  [
    'publish',
    'methods',
    'call',
    'callAsync',
    'apply',
    'applyAsync',
    'onConnection',
    'onMessage',
  ],
  function(name) {
    Meteor[name] = _.bind(Meteor.server[name], Meteor.server);
  }
);

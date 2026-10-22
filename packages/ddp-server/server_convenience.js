if (process.env.DDP_DEFAULT_CONNECTION_URL) {
  __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL =
    process.env.DDP_DEFAULT_CONNECTION_URL;
}

Meteor.server = new Server();

Meteor.refresh = async function (notification) {
  await DDPServer._InvalidationCrossbar.fire(notification);
};

// Proxy the public methods of Meteor.server so they can
// be called directly on Meteor.

  [
    'publish',
    'isAsyncCall',
    'methods',
    'call',
    'callAsync',
    'apply',
    'applyAsync',
    'onConnection',
    'onMessage',
  ].forEach(
  function(name) {
    Meteor[name] = Meteor.server[name].bind(Meteor.server);
  }
);

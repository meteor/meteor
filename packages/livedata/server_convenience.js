_.extend(Meteor, {
  default_server: null,
  refresh: function (notification) {
  }
});

// Only create a server (and map publish, methods, call, etc onto Meteor) if we
// are in an environment with a HTTP server (as opposed to, eg, a command-line
// tool).
if (Package.webapp) {
  if (process.env.DDP_DEFAULT_CONNECTION_URL) {
    __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL =
      process.env.DDP_DEFAULT_CONNECTION_URL;
  }

  Meteor.default_server = new Meteor._LivedataServer;

  Meteor.refresh = function (notification) {
    var fence = Meteor._CurrentWriteFence.get();
    if (fence) {
      // Block the write fence until all of the invalidations have
      // landed.
      var proxy_write = fence.beginWrite();
    }
    Meteor._InvalidationCrossbar.fire(notification, function () {
      if (proxy_write)
        proxy_write.committed();
    });
  };

  // Proxy the public methods of Meteor.default_server so they can
  // be called directly on Meteor.
  _.each(['publish', 'methods', 'call', 'apply'],
         function (name) {
           Meteor[name] = _.bind(Meteor.default_server[name],
                                 Meteor.default_server);
         });
}

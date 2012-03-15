_.extend(Meteor, {
  default_server: new Meteor._LivedataServer,

  refresh: function (notification) {
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
  }
});

// Proxy the public methods of Meteor.default_server so they can
// be called directly on Meteor.
_.each(['publish', 'methods', 'call', 'apply'],
       function (name) {
         Meteor[name] = _.bind(Meteor.default_server[name],
                               Meteor.default_server);
       });

App = new Meteor._LivedataServer;

_.extend(Meteor, {
  publish: _.bind(App.publish, App),

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

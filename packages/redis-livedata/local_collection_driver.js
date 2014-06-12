LocalCollectionDriver = function () {
  var self = this;
  self.noConnCollections = {};
  self.noConnStore = null;
};

var ensureCollection = function (store, pattern, collections) {
  if (!(pattern in collections))
    collections[pattern] = store.matching(pattern);
  return collections[pattern];
};

_.extend(LocalCollectionDriver.prototype, {
  open: function (pattern, conn) {
    var self = this;

    var store;
    if (conn) {
      store = conn._redis_store;
      if (!store) {
        store = conn._redis_store = new Miniredis.RedisStore();
      }
    } else {
      store = self.noConnStore;
      if (!store) {
        store = self.noConnStore = new Miniredis.RedisStore();
      }
    }
    if (!pattern)
      return store.matching("*");
    if (! conn) {
      return ensureCollection(store, pattern, self.noConnCollections);
    }
    if (! conn._redis_livedata_collections)
      conn._redis_livedata_collections = {};
    // XXX is there a way to keep track of a connection's collections without
    // dangling it off the connection object?
    return ensureCollection(store, pattern, conn._redis_livedata_collections);
  }
});

// singleton
LocalCollectionDriver = new LocalCollectionDriver;

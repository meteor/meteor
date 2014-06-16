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
  open: function (name, conn) {
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
    // XXX Redis doesn't have the concept of collections so for now the only
    // possible collection name is "redis"
    if (name !== "redis") {
      throw new Error("The only valid RedisCollection name is 'redis'");
    }
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

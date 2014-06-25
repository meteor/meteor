LocalCollectionDriver = function () {
  var self = this;
  self.noConnCollections = {};
  self.noConnStore = null;
};

var ensureCollection = function (store, name, collections) {
  if (!(name in collections))
    collections[name] = new Miniredis.RedisStore();
  return collections[name];
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
    if (! conn) {
      return ensureCollection(store, name, self.noConnCollections);
    }
    // XXX Redis doesn't have the concept of collections so for now the only
    // possible collection name is "redis"
    if (name !== "redis" && name !== null) {
      throw new Error("The only valid RedisCollection name is 'redis'");
    }
    if (! conn._redis_livedata_collections)
      conn._redis_livedata_collections = {};
    // XXX is there a way to keep track of a connection's collections without
    // dangling it off the connection object?
    return ensureCollection(store, name, conn._redis_livedata_collections);
  }
});

// singleton
LocalCollectionDriver = new LocalCollectionDriver;

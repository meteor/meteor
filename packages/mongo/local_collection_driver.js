LocalCollectionDriver = function () {
  var self = this;
  self.noConnCollections = {};
};

var ensureCollection = function (name, collections) {
  if (!(name in collections))
    collections[name] = new LocalCollection(name);
  return collections[name];
};

_.extend(LocalCollectionDriver.prototype, {
  open: function (name, conn) {
    var self = this;
    if (!name)
      return new LocalCollection;
    if (! conn) {
      return ensureCollection(name, self.noConnCollections);
    }
    if (! conn._mongo_livedata_collections)
      conn._mongo_livedata_collections = {};
    // XXX is there a way to keep track of a connection's collections without
    // dangling it off the connection object?
    return ensureCollection(name, conn._mongo_livedata_collections);
  }
});

// singleton
LocalCollectionDriver = new LocalCollectionDriver;

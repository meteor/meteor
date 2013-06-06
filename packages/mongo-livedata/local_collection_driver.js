// XXX namespacing
Meteor._LocalCollectionDriver = function () {
  var self = this;
  self.noConnCollections = {};
};

var ensureCollection = function (name, collections) {
  if (!(name in collections))
    collections[name] = new LocalCollection(name);
  return collections[name];
};

_.extend(Meteor._LocalCollectionDriver.prototype, {
  open: function (name, conn) {
    var self = this;
    if (!name)
      return new LocalCollection;
    if (! conn) {
      return ensureCollection(name, self.noConnCollections);
    }
    if (! conn.collections)
      conn.collections = {};
    // XXX is there a way to keep track of a connection's collections without
    // dangling it off the connection object?
    return ensureCollection(name, conn.collections);
  }
});

// singleton
Meteor._LocalCollectionDriver = new Meteor._LocalCollectionDriver;

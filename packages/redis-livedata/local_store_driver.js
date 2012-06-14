// XXX namespacing
Meteor._LocalStoreDriver = function () {
  var self = this;
  self.stores = {};
};

_.extend(Meteor._LocalStoreDriver.prototype, {
  open: function (name,type) {
    var self = this;
    if (!name)
      return new LocalHashStore;
    if (!(name in self.stores)) {
      var cls = {
        'string': LocalStringStore,
        'hash': LocalHashStore
      }[type];
      self.stores[name] = new cls;
    }
    return self.stores[name];
  }
});

// singleton
Meteor._LocalStoreDriver = new Meteor._LocalStoreDriver;
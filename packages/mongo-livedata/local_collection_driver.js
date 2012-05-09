// XXX namespacing
Meteor._LocalCollectionDriver = function () {
  var self = this;
  self.collections = {};
};

_.extend(Meteor._LocalCollectionDriver.prototype, {
  open: function (name, klass) {
    var self = this;
    if (!name)
      return new LocalCollection(klass);
    if (!(name in self.collections))
      self.collections[name] = new LocalCollection(klass);
    return self.collections[name];
  }
});

// singleton
Meteor._LocalCollectionDriver = new Meteor._LocalCollectionDriver;

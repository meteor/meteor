// XXX namespacing
Meteor._LocalCollectionDriver = function () {
  var self = this;
  self.collections = {};
  self.migrationData = {};
};

_.extend(Meteor._LocalCollectionDriver.prototype, {
  open: function (name) {
    var self = this;
    if (!name)
      return new LocalCollection;
    if (!(name in self.collections)) {
      self.collections[name] = new LocalCollection;
      if (name in self.migrationData )
        self.collections[name].docs = self.migrationData[name];
    }

    return self.collections[name];
  }
});

// singleton
Meteor._LocalCollectionDriver = new Meteor._LocalCollectionDriver;


//speed up reload and ensure that first render after reload 
//has same state as the last render before reload
if (Meteor._reload) {
  Meteor._reload.on_migrate('Collections',function() {
    var collections = {};
    _.each(Meteor._LocalCollectionDriver.collections,function(collection,name) {
      collections[name] = collection.docs;
    });
    return [true,collections];
  });
  (function() {
    Meteor._LocalCollectionDriver.migrationData = Meteor._reload.migration_data('Collections') || {};
  })();
}
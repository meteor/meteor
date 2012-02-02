if (typeof Meteor === "undefined") Meteor = {};

(function () {

  // read in old data at startup and blow it away.
  var old_data = {};
  // XXX implement


  var save_callbacks = {};

  ////////// External API //////////

  // Called by packages when they start up.
  // Registers a callback for when we want to save data.
  // Before a reload, callback is called, and should return
  // a JSONifyable object.
  Meteor._reload.on_migrate = function (name, callback) {
    save_callbacks[name] = callback;
  };

  // Called by packages when they start up.
  // Returns the object that was saved, or undefined if none saved.
  Meteor._reload.migration_data = function (name) {
    return old_data[name];
  };

  // Trigger a reload. Calls all the callbacks, saves all the values,
  // then blows up the world.
  Meteor._reload.reload = function () {
    Meteor._debug("XXX FORCE RELOAD HERE");
    // XXX implement
  };

})();

if (typeof Meteor === "undefined") Meteor = {};

(function () {
  Meteor._reload = {};

  var KEY_NAME = 'Meteor_Reload';
  // after how long should we consider this no longer an automatic
  // reload, but a fresh restart. This only happens if a reload is
  // interrupted and a user manually restarts things. The only time
  // this is really weird is if a user navigates away mid-refresh,
  // then manually navigates back to the page.
  var TIMEOUT = 30000;


  var old_data = {};
  // read in old data at startup.
  var old_json;
  if (typeof sessionStorage !== "undefined") {
    old_json = sessionStorage.getItem(KEY_NAME);
    sessionStorage.removeItem(KEY_NAME);

  } else {
    Meteor._debug("XXX UNSUPPORTED BROWSER");
  }

  if (!old_json) old_json = '{}';

  try {
    var old_parsed = JSON.parse(old_json);
    if (typeof old_parsed !== "object") {
      Meteor._debug("XXX INVALID old_json");
    }
  } catch (err) {
    Meteor._debug("XXX INVALID JSON");
  }

  if (old_parsed.reload && typeof old_parsed.data === "object" &&
      old_parsed.time + TIMEOUT > (new Date()).getTime()) {
    Meteor._debug("XXX RESTORING");

    old_data = old_parsed.data;
  }


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

    // ask everyone for stuff to save
    var new_data = {};
    _.each(save_callbacks, function (callback, name) {
      new_data[name] = callback();
    });

    var new_json;
    try {
      new_json = JSON.stringify({
        time: (new Date()).getTime(), data: new_data, reload: true
      });
    } catch (err) {
      Meteor._debug("XXX NON JSON DATA");
    }

    // save it
    if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(KEY_NAME, new_json);
    } else {
      Meteor._debug("XXX UNSUPPORTED BROWSER");
    }

    // blow up the world!
    window.location.reload();
  };

})();

if (typeof Meteor === "undefined") Meteor = {};

(function () {
  Meteor._reload = {};

  var KEY_NAME = 'Meteor_Reload';

  // read in old data at startup.
  var old_data = {};
  // check for fragment in URL to indicate reload
  if (window.location.hash &&
      window.location.hash.substr(0, KEY_NAME.length+1) === '#'+KEY_NAME) {
    Meteor._debug("XXX RESTORING");

    // remove fragment.
    // XXX this leaves a #!
    // XXX make sure that if there are id's in the document, we don't move!
    window.location.hash = window.location.hash.substr(KEY_NAME.length+1);

    // read and remove old data.
    var old_json;
    if (typeof sessionStorage !== "undefined") {
      old_json = sessionStorage.getItem(KEY_NAME);
      sessionStorage.removeItem(KEY_NAME);
    } else {
      Meteor._debug("XXX UNSUPPORTED BROWSER");
    }
    if (!old_json) old_json = '{}';

    // parse it.
    if (old_json) {
      try {
        old_data = JSON.parse(old_json);
        if (typeof old_data !== "object") {
          Meteor._debug("XXX INVALID old_json");
          old_data = {};
        }
      } catch (err) {
        Meteor._debug("XXX UNSUPPORTED BROWSER");
      }
    }

    Meteor._debug("XXX RESTORED", old_data);
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
      new_json = JSON.stringify(new_data);
    } catch (err) {
      Meteor._debug("XXX NON JSON DATA");
    }

    // save it
    if (typeof sessionStorage !== "undefined") {
      if (new_json)
        sessionStorage.setItem(KEY_NAME, new_json)
      else
        sessionStorage.removeItem(KEY_NAME);

    } else {
      Meteor._debug("XXX UNSUPPORTED BROWSER");
    }

    // the the fragment so we know it's a reload
    window.location.hash = KEY_NAME + window.location.hash;

    // blow up the world!
    window.location.reload();
  };

})();

/**
 * This code does _NOT_ support hot (session-restoring) reloads on
 * IE6,7. It only works on browsers with sessionStorage support.
 *
 * There are a couple approaches to add IE6,7 support:
 *
 * - use IE's "userData" mechanism in combination with window.name.
 * This mostly works, however the problem is that it can not get to the
 * data until after DOMReady. This is a problem for us since this API
 * relies on the data being ready before API users run. We could
 * refactor using Meteor.startup in all API users, but that might slow
 * page loads as we couldn't start the stream until after DOMReady.
 * Here are some resources on this approach:
 * https://github.com/hugeinc/USTORE.js
 * http://thudjs.tumblr.com/post/419577524/localstorage-userdata
 * http://www.javascriptkit.com/javatutors/domstorage2.shtml
 *
 * - POST the data to the server, and have the server send it back on
 * page load. This is nice because it sidesteps all the local storage
 * compatibility issues, however it is kinda tricky. We can use a unique
 * token in the URL, then get rid of it with HTML5 pushstate, but that
 * only works on pushstate browsers.
 *
 * This will all need to be reworked entirely when we add server-side
 * HTML rendering. In that case, the server will need to have access to
 * the client's session to render properly.
 */

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
    // Unsupported browser (IE 6,7). No session resumption.
    // Meteor._debug("XXX UNSUPPORTED BROWSER");
  }

  if (!old_json) old_json = '{}';
  var old_parsed = {};
  try {
    old_parsed = JSON.parse(old_json);
    if (typeof old_parsed !== "object") {
      Meteor._debug("Got bad data on reload. Ignoring.");
      old_parsed = {};
    }
  } catch (err) {
    Meteor._debug("Got invalid JSON on reload. Ignoring.");
  }

  if (old_parsed.reload && typeof old_parsed.data === "object" &&
      old_parsed.time + TIMEOUT > (new Date()).getTime()) {
    // Meteor._debug("Restoring reload data.");
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
    // Meteor._debug("Beginning hot reload.");

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
      Meteor._debug("Asked to persist non-JSONable data. Ignoring.");
      new_json = '{}';
    }

    // save it
    if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(KEY_NAME, new_json);
    } else {
      Meteor._debug("Browser does not support sessionStorage. Not saving reload state.");
    }

    // blow up the world!
    window.location.reload();
  };

})();

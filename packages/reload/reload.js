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


  var providers = [];

  ////////// External API //////////

  // Called by packages when they start up.
  // Registers a callback for when we want to save data.
  // Before a reload, callback is called. It takes one argument, a
  // function. The package should wait until it is ready to migrate,
  // and then call the function. If it has migration data, it should
  // pass it to the function as a single JSON-compatible argument.
  Meteor._reload.on_migrate = function (name, callback) {
    providers.push({name: name, callback: callback});
  };

  // Called by packages when they start up.
  // Returns the object that was saved, or undefined if none saved.
  Meteor._reload.migration_data = function (name) {
    return old_data[name];
  };

  // Trigger a reload. Starts a process that asynchronously calls all
  // the callbacks, saves all the values, and then terminates this VM
  // and starts a new one.
  var reloading = false;
  Meteor._reload.reload = function () {
    if (reloading)
      return;
    reloading = true;

    // ask everyone for stuff to save, asynchronously
    var migration_data = {};
    var remaining = _.clone(providers);
    var requestNext = function () {
      var next = remaining.shift();
      if (!next)
        saveAndRestart();
      else
        next.callback(function (value) {
          if (value !== undefined)
            migration_data[next.name] = value;
          requestNext();
        });
    };

    // then persist the migration data and restart
    var saveAndRestart = function () {
      var json;
      try {
        json = JSON.stringify({
          time: (new Date()).getTime(), data: migration_data, reload: true
        });
      } catch (err) {
        Meteor._debug("Asked to persist non-JSONable data. Ignoring.");
        json = '{}';
      }

      // save it
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(KEY_NAME, json);
      } else {
        Meteor._debug("Browser does not support sessionStorage. Not saving reload state.");
      }

      // Restart with the new code.
      window.location.reload();
    };

    // kick off asynchronous process
    requestNext();
  };

})();

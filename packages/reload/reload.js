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

// XXX when making this API public, also expose a flag for the app
// developer to know whether a hot code push is happening. This is
// useful for apps using `window.onbeforeunload`. See
// https://github.com/meteor/meteor/pull/657

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
// On Firefox with dom.storage.enabled set to false, sessionStorage is null,
// so we have to both check to see if it is defined and not null.
if (typeof sessionStorage !== "undefined" && sessionStorage) {
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

Reload = {};

// Packages that support migration should register themselves by
// calling this function. When it's time to migrate, callback will
// be called with one argument, the "retry function." If the package
// is ready to migrate, it should return [true, data], where data is
// its migration data, an arbitrary JSON value (or [true] if it has
// no migration data this time). If the package needs more time
// before it is ready to migrate, it should return false. Then, once
// it is ready to migrating again, it should call the retry
// function. The retry function will return immediately, but will
// schedule the migration to be retried, meaning that every package
// will be polled once again for its migration data. If they are all
// ready this time, then the migration will happen. name must be set if there
// is migration data.
//
Reload._onMigrate = function (name, callback) {
  if (!callback) {
    // name not provided, so first arg is callback.
    callback = name;
    name = undefined;
  }
  providers.push({name: name, callback: callback});
};

// Called by packages when they start up.
// Returns the object that was saved, or undefined if none saved.
//
Reload._migrationData = function (name) {
  return old_data[name];
};

// Migrating reload: reload this page (presumably to pick up a new
// version of the code or assets), but save the program state and
// migrate it over. This function returns immediately. The reload
// will happen at some point in the future once all of the packages
// are ready to migrate.
//
var reloading = false;
Reload._reload = function () {
  if (reloading)
    return;
  reloading = true;

  var tryReload = function () { _.defer(function () {
    // Make sure each package is ready to go, and collect their
    // migration data
    var migrationData = {};
    var remaining = _.clone(providers);
    while (remaining.length) {
      var p = remaining.shift();
      var status = p.callback(tryReload);
      if (!status[0])
        return; // not ready yet..
      if (status.length > 1 && p.name)
        migrationData[p.name] = status[1];
    };

    try {
      // Persist the migration data
      var json = JSON.stringify({
        time: (new Date()).getTime(), data: migrationData, reload: true
      });
    } catch (err) {
      Meteor._debug("Couldn't serialize data for migration", migrationData);
      throw err;
    }

    if (typeof sessionStorage !== "undefined" && sessionStorage) {
      try {
        sessionStorage.setItem(KEY_NAME, json);
      } catch (err) {
        // happens in safari with private browsing
        Meteor._debug("Couldn't save data for migration to sessionStorage", err);
      }
    } else {
      Meteor._debug("Browser does not support sessionStorage. Not saving migration state.");
    }

    // Tell the browser to shut down this VM and make a new one
    window.location.reload();
  }); };

  tryReload();
};

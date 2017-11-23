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

export const Reload = {};

var KEY_NAME = 'Meteor_Reload';

var old_data = {};
// read in old data at startup.
var old_json;

// This logic for sessionStorage detection is based on browserstate/history.js
var safeSessionStorage = null;
try {
  // This throws a SecurityError on Chrome if cookies & localStorage are
  // explicitly disabled
  //
  // On Firefox with dom.storage.enabled set to false, sessionStorage is null
  //
  // We can't even do (typeof sessionStorage) on Chrome, it throws.  So we rely
  // on the throw if sessionStorage == null; the alternative is browser
  // detection, but this seems better.
  safeSessionStorage = window.sessionStorage;

  // Check we can actually use it
  if (safeSessionStorage) {
    safeSessionStorage.setItem('__dummy__', '1');
    safeSessionStorage.removeItem('__dummy__');
  } else {
    // Be consistently null, for safety
    safeSessionStorage = null;
  }
} catch(e) {
  // Expected on chrome with strict security, or if sessionStorage not supported
  safeSessionStorage = null;
}

// Exported for test.
Reload._getData = function () {
  return safeSessionStorage && safeSessionStorage.getItem(KEY_NAME);
};

if (safeSessionStorage) {
  old_json = Reload._getData();
  safeSessionStorage.removeItem(KEY_NAME);
} else {
  // Unsupported browser (IE 6,7) or locked down security settings.
  // No session resumption.
  // Meteor._debug("XXX UNSUPPORTED BROWSER/SETTINGS");
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

if (old_parsed.reload && typeof old_parsed.data === "object") {
  // Meteor._debug("Restoring reload data.");
  old_data = old_parsed.data;
}


var providers = [];

////////// External API //////////

// Packages that support migration should register themselves by calling
// this function. When it's time to migrate, callback will be called
// with one argument, the "retry function," and an optional 'option'
// argument (containing a key 'immediateMigration'). If the package
// is ready to migrate, it should return [true, data], where data is
// its migration data, an arbitrary JSON value (or [true] if it has
// no migration data this time). If the package needs more time
// before it is ready to migrate, it should return false. Then, once
// it is ready to migrating again, it should call the retry
// function. The retry function will return immediately, but will
// schedule the migration to be retried, meaning that every package
// will be polled once again for its migration data. If they are all
// ready this time, then the migration will happen. name must be set if there
// is migration data. If 'immediateMigration' is set in the options
// argument, then it doesn't matter whether the package is ready to
// migrate or not; the reload will happen immediately without waiting
// (used for OAuth redirect login).
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

// Options are the same as for `Reload._migrate`.
var pollProviders = function (tryReload, options) {
  tryReload = tryReload || function () {};
  options = options || {};

  var migrationData = {};
  var remaining = providers.slice(0);
  var allReady = true;
  while (remaining.length) {
    var p = remaining.shift();
    var status = p.callback(tryReload, options);
    if (!status[0])
      allReady = false;
    if (status.length > 1 && p.name)
      migrationData[p.name] = status[1];
  };
  if (allReady || options.immediateMigration)
    return migrationData;
  else
    return null;
};

// Options are:
//  - immediateMigration: true if the page will be reloaded immediately
//    regardless of whether packages report that they are ready or not.
Reload._migrate = function (tryReload, options) {
  // Make sure each package is ready to go, and collect their
  // migration data
  var migrationData = pollProviders(tryReload, options);
  if (migrationData === null)
    return false; // not ready yet..

  try {
    // Persist the migration data
    var json = JSON.stringify({
      data: migrationData, reload: true
    });
  } catch (err) {
    Meteor._debug("Couldn't serialize data for migration", migrationData);
    throw err;
  }

  if (safeSessionStorage) {
    try {
      safeSessionStorage.setItem(KEY_NAME, json);
    } catch (err) {
      // We should have already checked this, but just log - don't throw
      Meteor._debug("Couldn't save data for migration to sessionStorage", err);
    }
  } else {
    Meteor._debug("Browser does not support sessionStorage. Not saving migration state.");
  }

  return true;
};

// Allows tests to isolate the list of providers.
Reload._withFreshProvidersForTest = function (f) {
  var originalProviders = providers.slice(0);
  providers = [];
  try {
    f();
  } finally {
    providers = originalProviders;
  }
};

// Migrating reload: reload this page (presumably to pick up a new
// version of the code or assets), but save the program state and
// migrate it over. This function returns immediately. The reload
// will happen at some point in the future once all of the packages
// are ready to migrate.
//
var reloading = false;
Reload._reload = function (options) {
  options = options || {};

  if (reloading)
    return;
  reloading = true;

  function tryReload() {
    setTimeout(reload, 1);
  }

  function reload() {
    if (Reload._migrate(tryReload, options)) {
      // We'd like to make the browser reload the page using location.replace()
      // instead of location.reload(), because this avoids validating assets
      // with the server if we still have a valid cached copy. This doesn't work
      // when the location contains a hash however, because that wouldn't reload
      // the page and just scroll to the hash location instead.
      if (window.location.hash || window.location.href.endsWith("#")) {
        window.location.reload();
      } else {
        window.location.replace(window.location.href);
      }
    }
  }

  tryReload();
};

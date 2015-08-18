var queue = [];
var loaded = !Meteor.isCordova &&
  (document.readyState === "loaded" || document.readyState == "complete");

var awaitingEventsCount = 1;
var ready = function() {
  awaitingEventsCount--;
  if (awaitingEventsCount > 0)
    return;

  loaded = true;
  var runStartupCallbacks = function () {
    if (Meteor.isCordova) {
      if (! cordova.plugins || ! cordova.plugins.CordovaUpdate) {
        // XXX This timeout should not be necessary.
        // Cordova indicates that all the cordova plugins files have been loaded
        // and plugins are ready to be used when the "deviceready" callback
        // fires. Even though we wait for the "deviceready" event, plugins
        // have been observed to still not be ready (likely a Cordova bug).
        // We check the availability of the Cordova-Update plugin (the only
        // plugin that we always include for sure) and retry a bit later if it
        // is nowhere to be found. Experiments have found that either all
        // plugins are attached or none.
        Meteor.setTimeout(runStartupCallbacks, 20);
        return;
      }
    }

    while (queue.length)
      (queue.shift())();
  };
  runStartupCallbacks();
};

if (document.addEventListener) {
  document.addEventListener('DOMContentLoaded', ready, false);

  if (Meteor.isCordova) {
    awaitingEventsCount++;
    document.addEventListener('deviceready', ready, false);
  }

  window.addEventListener('load', ready, false);
} else {
  document.attachEvent('onreadystatechange', function () {
    if (document.readyState === "complete")
      ready();
  });
  window.attachEvent('load', ready);
}

/**
 * @summary Run code when a client or a server starts.
 * @locus Anywhere
 * @param {Function} func A function to run on startup.
 */
Meteor.startup = function (cb) {
  var doScroll = !document.addEventListener &&
    document.documentElement.doScroll;

  if (!doScroll || window !== top) {
    if (loaded)
      cb();
    else
      queue.push(cb);
  } else {
    try { doScroll('left'); }
    catch (e) {
      setTimeout(function() { Meteor.startup(cb); }, 50);
      return;
    };
    cb();
  }
};

var queue = [];
var loaded = !Meteor.isCordova &&
  (document.readyState === "loaded" || document.readyState == "complete");

var awaitingEventsCount = 1;
var ready = function() {
  awaitingEventsCount--;
  if (awaitingEventsCount > 0)
    return;

  // XXX hide the splash screen if such exists, only on mobile
  if (Meteor.isCordova) {
    navigator.splashscreen && navigator.splashscreen.hide();
  }

  loaded = true;
  while (queue.length)
    (queue.shift())();
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

var queue = [];
var loaded = document.readyState === "loaded" ||
  document.readyState == "complete";

var fireQueuedCallbacks = function () {
  while (queue.length) {
    (queue.shift())();
  }
};

var ready = function() {
  loaded = true;
  fireQueuedCallbacks();
};

if (document.addEventListener) {
  document.addEventListener('DOMContentLoaded', ready, false);
  window.addEventListener('load', ready, false);
} else {
  document.attachEvent('onreadystatechange', function () {
    if (document.readyState === "complete")
      ready();
  });
  window.attachEvent('load', ready);
}

// Fallback for browsers that docn't support DOMContentLoaded
var legacyPollReady = function () {
  try { doScroll('left'); }
  catch (e) {
    setTimeout(function () { legacyPollReady(); }, 50);
    return;
  }
  fireQueuedCallbacks();
};

Meteor.startup = function (cb) {
  queue.push(cb);
  var doScroll = !document.addEventListener &&
    document.documentElement.doScroll;
  if (!doScroll || window !== top) {
    if (loaded)
      Meteor._setImmediate(fireQueuedCallbacks);
  } else {
    // XXX: Try to avoid multiple concurrent polls?
    Meteor._setImmediate(legacyPollReady);
  }
};

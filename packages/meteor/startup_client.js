var callbackQueue = [];
var isLoadingCompleted = false;
var eagerCodeRan = false;
var isReady = false;

// Keeps track of how many events to wait for in addition to loading completing,
// before we're considered ready.
var readyHoldsCount = 0;

var holdReady =  function () {
  readyHoldsCount++;
}

var releaseReadyHold = function () {
  readyHoldsCount--;
  maybeReady();
}

var maybeReady = function () {
  if (isReady || !eagerCodeRan || readyHoldsCount > 0)
    return;

  isReady = true;

  // Run startup callbacks
  while (callbackQueue.length)
    (callbackQueue.shift())();

  if (Meteor.isCordova) {
    // Notify the WebAppLocalServer plugin that startup was completed successfully,
    // so we can roll back faulty versions if this doesn't happen
    WebAppLocalServer.startupDidComplete();
  }
};

function waitForEagerAsyncModules () {
  function finish() {
    eagerCodeRan = true;
    maybeReady();
  }

  var potentialPromise = Package['core-runtime'].waitUntilAllLoaded();

  if (potentialPromise === null) {
    finish();
  } else {
    potentialPromise.then(function () {
      finish();
    });
  }
}

var loadingCompleted = function () {
  if (isLoadingCompleted) {
    return;
  }

  isLoadingCompleted = true;
  waitForEagerAsyncModules();
}

if (Meteor.isCordova) {
  holdReady();
  document.addEventListener('deviceready', releaseReadyHold, false);
}

if (document.readyState === 'complete' || document.readyState === 'loaded') {
  // Loading has completed,
  // but allow other scripts the opportunity to hold ready
  window.setTimeout(loadingCompleted);
} else { // Attach event listeners to wait for loading to complete
  if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', loadingCompleted, false);
    window.addEventListener('load', loadingCompleted, false);
  } else { // Use IE event model for < IE9
    document.attachEvent('onreadystatechange', function () {
      if (document.readyState === "complete") {
        loadingCompleted();
      }
    });
    window.attachEvent('load', loadingCompleted);
  }
}

/**
 * @summary Run code when a client or a server starts.
 * @locus Anywhere
 * @param {Function} func A function to run on startup.
 */
Meteor.startup = function (callback) {
  // Fix for < IE9, see http://javascript.nwbox.com/IEContentLoaded/
  var doScroll = !document.addEventListener &&
    document.documentElement.doScroll;

  if (!doScroll || window !== top) {
    if (isReady)
      callback();
    else
      callbackQueue.push(callback);
  } else {
    try { doScroll('left'); }
    catch (error) {
      setTimeout(function () { Meteor.startup(callback); }, 50);
      return;
    };
    callback();
  }
};

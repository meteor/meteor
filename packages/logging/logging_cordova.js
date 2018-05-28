// Log all uncaught errors so they can be printed to the developer.
// But since Android's adb catlog already prints the uncaught exceptions, we
// can disable it for Android.
if (! /Android/i.test(navigator.userAgent)) {
  window.onerror = function (msg, url, line) {
    // Cut off the url prefix, the meaningful part always starts at 'www/' in
    // Cordova apps.
    url = url.replace(/^.*?\/www\//, '');
    console.log(`Uncaught Error: ${msg}:${line}:${url}`);
  };
}

export * from './logging.js';

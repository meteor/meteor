// Log all uncaught errors so they can be printed to the developer through adb
// and logcat with Android or regular log file with iOS.
window.onerror = function (msg, url, line) {
  // Cut off the url prefix, the meaningful part always starts at 'www/' in
  // Cordova apps.
  url = url.replace(/^.*?\/www\//, '');
  console.log('Uncaught Error: ' + msg + ':' + line + ':' + url);
}


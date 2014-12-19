var files = require("./files.js");

// Set this env variable to a truthy value to force files.watchFile instead
// of pathwatcher.watch.
var canUsePathwatcher = !process.env.METEOR_WATCH_FORCE_POLLING;

var pollingInterval = canUsePathwatcher
  // Set this env variable to alter the watchFile polling interval.
  ? ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 5000
  : 500;

exports.watch = function watch(absPath, callback) {
  var lastPathwatcherEventTime = 0;

  function pathwatcherWrapper() {
    // It's tempting to call files.unwatchFile(absPath, watchFileWrapper)
    // here, but previous pathwatcher success is no guarantee of future
    // pathwatcher reliability. For example, pathwatcher works just fine
    // when file changes originate from within a Vagrant VM, but changes
    // to shared files made outside the VM are invisible to pathwatcher,
    // so our only hope of catching them is to continue polling.
    lastPathwatcherEventTime = +new Date;
    callback.apply(this, arguments);
  }

  var watcher = canUsePathwatcher &&
    require("pathwatcher").watch(absPath, pathwatcherWrapper);

  function watchFileWrapper() {
    // If a pathwatcher event fired in the last polling interval, ignore
    // this event.
    if (new Date - lastPathwatcherEventTime > pollingInterval) {
      callback.apply(this, arguments);
    }
  }

  // We use files.watchFile in addition to pathwatcher.watch as a fail-safe
  // to detect file changes even on network file systems.  However (unless
  // canUsePathwatcher is false), we use a relatively long default polling
  // interval of 5000ms to save CPU cycles.
  files.watchFile(absPath, {
    persistent: false,
    interval: pollingInterval
  }, watchFileWrapper);

  var polling = true;

  return {
    close: function close() {
      if (watcher) {
        watcher.close();
        watcher = null;
      }

      if (polling) {
        polling = false;
        files.unwatchFile(absPath, watchFileWrapper);
      }
    }
  };
};

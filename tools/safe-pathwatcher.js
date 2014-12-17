var files = require("./files.js");

// Set this env variable to a truthy value to force files.watchFile
// instead of files.pathwatcherWatch.
var canUsePathwatcher = !process.env.METEOR_WATCH_FORCE_POLLING;

var pollingInterval = canUsePathwatcher
  // Set this env variable to alter the watchFile polling interval.
  ? ~~process.env.METEOR_WATCH_POLLING_INTERVAL_MS || 5000
  : 500;

exports.watch = function watch(absPath, callback) {
  var lastPathwatcherEventTime = 0;
  var lastWatchFileEventTime = 0;

  // The maximum amount of time in milliseconds that we're willing to wait
  // for a pathwatcher event to fire, if it's ever going to fire.
  var pathwatcherLatencyBound = 50;

  var watcher = canUsePathwatcher && files.pathwatcherWatch(absPath, function() {
    // It's tempting to call files.unwatchFile(absPath, watchFileWrapper)
    // here, but previous pathwatcher success is no guarantee of future
    // pathwatcher reliability. For example, pathwatcher works just fine
    // when file changes originate from within a Vagrant VM, but changes
    // to shared files made outside the VM are invisible to pathwatcher,
    // so our only hope of catching them is to continue polling.

    // If a watchFile event fired very recently, ignore this event.
    var now = +new Date;
    if (now - lastWatchFileEventTime > pathwatcherLatencyBound) {
      lastPathwatcherEventTime = now;
      callback.apply(this, arguments);
    }
  });

  function watchFileWrapper() {
    // If a pathwatcher event fired in the last polling interval, ignore
    // this event.
    var now = +new Date;
    if (now - lastPathwatcherEventTime > pollingInterval) {
      lastWatchFileEventTime = now;
      console.log("firing watchFile event");
      callback.apply(this, arguments);
    } else {
      console.log("dropping watchFile event");
    }
  }

  // We use files.watchFile in addition to files.pathwatcherWatch as a
  // fail-safe to detect file changes even on network file systems.
  // However (unless canUsePathwatcher is false), we use a relatively long
  // default polling interval of 5000ms to save CPU cycles.
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

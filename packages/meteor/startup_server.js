Meteor.startup = function startup(callback) {
  callback = Meteor.wrapFn(callback);
  if (process.env.METEOR_PROFILE) {
    // Create a temporary error to capture the current stack trace.
    var error = new Error("Meteor.startup");

    // Capture the stack trace of the Meteor.startup call, excluding the
    // startup stack frame itself.
    Error.captureStackTrace(error, startup);

    callback.stack = error.stack
      .split(/\n\s*/) // Split lines and remove leading whitespace.
      .slice(0, 2) // Only include the call site.
      .join(" ") // Collapse to one line.
      .replace(/^Error: /, ""); // Not really an Error per se.
  }

  var bootstrap = global.__meteor_bootstrap__;
  if (bootstrap &&
      bootstrap.startupHooks) {
    bootstrap.startupHooks.push(callback);
  } else {
    // We already started up. Just call it now.
    callback();
  }
};

/**
 * @summary Run code when the server is about to shut down (on SIGINT or SIGTERM).
 * @locus Server
 * @param {Function} func A function to run on shutdown. Receives the triggering signal name (`'SIGINT'` or `'SIGTERM'`) as its first argument. May be async.
 */
Meteor.onShutdown = function onShutdown(callback) {
  callback = Meteor.wrapFn(callback);
  if (process.env.METEOR_PROFILE) {
    // Create a temporary error to capture the current stack trace.
    const error = new Error("Meteor.onShutdown");

    // Capture the stack trace of the Meteor.onShutdown call, excluding the
    // onShutdown stack frame itself.
    Error.captureStackTrace(error, onShutdown);

    callback.stack = error.stack
      .split(/\n\s*/) // Split lines and remove leading whitespace.
      .slice(0, 2) // Only include the call site.
      .join(" ") // Collapse to one line.
      .replace(/^Error: /, ""); // Not really an Error per se.
  }

  const bootstrap = global.__meteor_bootstrap__;
  if (bootstrap && bootstrap.shutdownHooks) {
    bootstrap.shutdownHooks.push(callback);
  } else {
    // shutdownHooks is null -> shutdown has already begun (or core is missing).
    // Warn loudly and best-effort the hook via a microtask; if the process
    // exits before it runs, the warning is the user-visible signal.
    console.warn(
      '[Meteor.onShutdown] hook registered after shutdown started; running immediately'
    );
    Promise.resolve().then(callback).catch(function (e) {
      console.error('[Meteor.onShutdown] late hook threw:', e && e.stack || e);
    });
  }
};

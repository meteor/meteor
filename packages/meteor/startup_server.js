Meteor.startup = function startup(callback) {
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

  if (__meteor_bootstrap__.startupHooks) {
    __meteor_bootstrap__.startupHooks.push(callback);
  } else {
    // We already started up. Just call it now.
    callback();
  }
};

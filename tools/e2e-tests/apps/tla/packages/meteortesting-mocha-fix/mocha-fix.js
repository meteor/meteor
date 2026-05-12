import { Meteor } from 'meteor/meteor';

// meteortesting:mocha@3.4.0-rc.0 (meteor-mocha PR #177) added
//   `await new Promise((resolve) => Meteor.startup(resolve));`
// at the top of `start()` to wait for async Meteor.startup callbacks to drain
// before running tests. That await deadlocks when `start()` itself runs as a
// hook inside boot.js's sequential `while (length) { await hook(); }` loop:
// pushing `resolve` onto the queue is pointless because the loop is blocked
// waiting for our hook to return.
//
// Workaround: while start() runs, redirect Meteor.startup to invoke the
// callback synchronously. This collapses the await into a no-op tick. The
// async-startup test is .skip'd anyway, so functionality lost is functionality
// not yet exercised. Track upstream fix in meteor-mocha PR #177 / issue #176.

const mocha = Package['meteortesting:mocha'];
if (mocha && typeof mocha.start === 'function') {
  const originalStart = mocha.start;
  mocha.start = async function patchedStart(...args) {
    const originalMeteorStartup = Meteor.startup;
    Meteor.startup = function patchedMeteorStartup(cb) { return cb(); };
    try {
      return await originalStart.apply(this, args);
    } finally {
      Meteor.startup = originalMeteorStartup;
    }
  };
}

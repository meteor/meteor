import { Tinytest } from "./tinytest.js";
import {
  ServerTestResultsSubscription,
  ServerTestResultsCollection,
} from "./model.js";

export { Tinytest };

const Fiber = require('fibers');
const handlesForRun = new Map;
const reportsForRun = new Map;

Meteor.publish(ServerTestResultsSubscription, function (runId) {
  check(runId, String);

  if (! handlesForRun.has(runId)) {
    handlesForRun.set(runId, new Set);
  }

  handlesForRun.get(runId).add(this);

  this.onStop(() => {
    handlesForRun.get(runId).delete(this);
  });

  if (reportsForRun.has(runId)) {
    this.added(ServerTestResultsCollection, runId,
               reportsForRun.get(runId));
  } else {
    this.added(ServerTestResultsCollection, runId, {});
  }

  this.ready();
});

Meteor.methods({
  'tinytest/run'(runId, pathPrefix) {
    check(runId, String);
    check(pathPrefix, Match.Optional([String]));
    this.unblock();

    reportsForRun.set(runId, Object.create(null));

    function addReport(key, report) {
      var fields = {};
      fields[key] = report;
      const handles = handlesForRun.get(runId);
      if (handles) {
        handles.forEach(handle => {
          handle.changed(ServerTestResultsCollection, runId, fields);
        });
      }
      // Save for future subscriptions.
      reportsForRun.get(runId)[key] = report;
    }

    function onReport(report) {
      if (! Fiber.current) {
        Meteor._debug("Trying to report a test not in a fiber! "+
                      "You probably forgot to wrap a callback in bindEnvironment.");
        console.trace();
      }
      var dummyKey = Random.id();
      addReport(dummyKey, report);
    }

    function onComplete() {
      // We send an object for current and future compatibility,
      // though we could get away with just sending { complete: true }
      var report = { done: true };
      var key = 'complete';
      addReport(key, report);
    }

    Tinytest._runTests(onReport, onComplete, pathPrefix);
  },

  'tinytest/clearResults'(runId) {
    check(runId, String);

    handlesForRun.get(runId).forEach(handle => {
      // XXX this doesn't actually notify the client that it has been
      // unsubscribed.
      handle.stop();
    });

    handlesForRun.delete(runId);
    reportsForRun.delete(runId);
  }
});

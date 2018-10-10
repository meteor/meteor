import { Facts, FACTS_COLLECTION, FACTS_PUBLICATION } from './facts_base_common';

// This file is only used server-side, so no need to check Meteor.isServer.

// By default, we publish facts to no user if autopublish is off, and to all
// users if autopublish is on.
let userIdFilter = function (userId) {
  return !!Package.autopublish;
};

// XXX make this take effect at runtime too?
Facts.setUserIdFilter = function (filter) {
  userIdFilter = filter;
};

// XXX Use a minimongo collection instead and hook up an observeChanges
// directly to a publish.
const factsByPackage = {};
let activeSubscriptions = [];

// Make factsByPackage data available to the server environment
Facts._factsByPackage = factsByPackage;

Facts.incrementServerFact = function (pkg, fact, increment) {
  if (!_.has(factsByPackage, pkg)) {
    factsByPackage[pkg] = {};
    factsByPackage[pkg][fact] = increment;
    _.each(activeSubscriptions, function (sub) {
      sub.added(FACTS_COLLECTION, pkg, factsByPackage[pkg]);
    });
    return;
  }

  const packageFacts = factsByPackage[pkg];
  if (!_.has(packageFacts, fact)) {
    factsByPackage[pkg][fact] = 0;
  }
  factsByPackage[pkg][fact] += increment;
  const changedField = {};
  changedField[fact] = factsByPackage[pkg][fact];
  _.each(activeSubscriptions, function (sub) {
    sub.changed(FACTS_COLLECTION, pkg, changedField);
  });
};

// Deferred, because we have an unordered dependency on livedata.
// XXX is this safe? could somebody try to connect before Meteor.publish is
// called?
Meteor.defer(function () {
  // XXX Also publish facts-by-package.
  Meteor.publish(FACTS_PUBLICATION, function () {
    const sub = this;
    if (!userIdFilter(this.userId)) {
      sub.ready();
      return;
    }

    activeSubscriptions.push(sub);
    _.each(factsByPackage, function (facts, pkg) {
      sub.added(FACTS_COLLECTION, pkg, facts);
    });
    sub.onStop(function () {
      activeSubscriptions = _.without(activeSubscriptions, sub);
    });
    sub.ready();
  }, {is_auto: true});
});

export {
  Facts,
  FACTS_COLLECTION,
  FACTS_PUBLICATION,
};

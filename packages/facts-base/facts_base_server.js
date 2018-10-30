import { Facts, FACTS_COLLECTION, FACTS_PUBLICATION } from './facts_base_common';

const hasOwn = Object.prototype.hasOwnProperty;

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
  if (!hasOwn.call(factsByPackage, pkg)) {
    factsByPackage[pkg] = {};
    factsByPackage[pkg][fact] = increment;
    activeSubscriptions.forEach(function (sub) {
      sub.added(FACTS_COLLECTION, pkg, factsByPackage[pkg]);
    });
    return;
  }

  const packageFacts = factsByPackage[pkg];
  if (!hasOwn.call(packageFacts, fact)) {
    factsByPackage[pkg][fact] = 0;
  }
  factsByPackage[pkg][fact] += increment;
  const changedField = {};
  changedField[fact] = factsByPackage[pkg][fact];
  activeSubscriptions.forEach(function (sub) {
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
    Object.keys(factsByPackage).forEach(function (pkg) {
      sub.added(FACTS_COLLECTION, pkg, factsByPackage[pkg]);
    });
    sub.onStop(function () {
      activeSubscriptions =
        activeSubscriptions.filter(activeSub => activeSub !== sub);
    });
    sub.ready();
  }, {is_auto: true});
});

export {
  Facts,
  FACTS_COLLECTION,
  FACTS_PUBLICATION,
};

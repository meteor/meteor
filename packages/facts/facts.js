(function(){

Meteor.Facts = {};

var serverFactsCollection = 'Facts.server';

if (Meteor.isServer) {
  var autopublishIsOn = false;
  Meteor.default_server.onAutopublish(function () {
    autopublishIsOn = true;
  });

  // By default, we publish facts to no user if autopublish is off, and to all
  // users if autopublish is on.
  var userIdFilter = function (userId) {
    return autopublishIsOn;
  };

  // XXX make this take effect at runtime too?
  Meteor.Facts.setUserIdFilter = function (filter) {
    userIdFilter = filter;
  };

  // XXX Use a minimongo collection instead and hook up an observeChanges
  // directly to a publish.
  var factsByPackage = {};
  var activeSubscriptions = [];

  Meteor.Facts.incrementServerFact = function (pkg, fact, increment) {
    if (!_.has(factsByPackage, pkg)) {
      factsByPackage[pkg] = {};
      factsByPackage[pkg][fact] = increment;
      _.each(activeSubscriptions, function (sub) {
        sub.added(serverFactsCollection, pkg, factsByPackage[pkg]);
      });
      return;
    }

    var packageFacts = factsByPackage[pkg];
    if (!_.has(packageFacts, fact))
      factsByPackage[pkg][fact] = 0;
    factsByPackage[pkg][fact] += increment;
    var changedField = {};
    changedField[fact] = factsByPackage[pkg][fact];
    _.each(activeSubscriptions, function (sub) {
      sub.changed(serverFactsCollection, pkg, changedField);
    });
  };

  // XXX Also publish facts-by-package.
  Meteor.publish("facts", function () {
    var sub = this;
    if (!userIdFilter(this.userId)) {
      sub.ready();
      return;
    }
    activeSubscriptions.push(sub);
    _.each(factsByPackage, function (facts, pkg) {
      sub.added(serverFactsCollection, pkg, facts);
    });
    sub.onStop(function () {
      activeSubscriptions = _.without(activeSubscriptions, sub);
    });
    sub.ready();
  });
} else {
  Meteor.Facts.server = new Meteor.Collection(serverFactsCollection);
  Meteor.subscribe("facts");
  Template.serverFacts.factsByPackage = function () {
    return Meteor.Facts.server.find();
  };
  Template.serverFacts.facts = function () {
    var factArray = [];
    _.each(this, function (value, name) {
      if (name !== '_id')
        factArray.push({name: name, value: value});
    });
    return factArray;
  };
}
})();

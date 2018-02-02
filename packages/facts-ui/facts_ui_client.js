import { Facts, FACTS_COLLECTION, FACTS_PUBLICATION } from 'meteor/facts-base';

console.log('Facts UI client');

Facts.server = new Mongo.Collection(FACTS_COLLECTION);

Template.serverFacts.helpers({
  factsByPackage: function () {
    const facts = Facts.server.find();
    console.log("Facts", facts);
    return facts;
  },
  facts: function () {
    const factArray = [];
    _.each(this, function (value, name) {
      if (name !== '_id')
        factArray.push({name: name, value: value});
    });
    return factArray;
  }
});

// Subscribe when the template is first made, and unsubscribe when it
// is removed. If for some reason puts two copies of the template on
// the screen at once, we'll subscribe twice. Meh.
Template.serverFacts.onCreated(function () {
  this._stopHandle = Meteor.subscribe(FACTS_PUBLICATION);
});
Template.serverFacts.onDestroyed(function () {
  if (this._stopHandle) {
    this._stopHandle.stop();
    this._stopHandle = null;
  }
});

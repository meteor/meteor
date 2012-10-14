// XXX autopublish warning is printed on each restart. super spammy!

Meteor.publish("directory", function () {
  // XXX too easy to accidentally publish the list of validation tokens
  return Meteor.users.find({}, {fields: {"emails.address": 1}});
});

Meteor.publish("parties", function () {
  return Parties.find(
    {$or: [{"public": true}, {canSee: this.userId}, {owner: this.userId}]});
});

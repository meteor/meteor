// XXX autopublish warning is printed on each restart. super spammy!

Meteor.publish("directory", function () {
  return Meteor.users.find({}, {fields: {_id: 1, emails: 1}});
});

Durations = null;

Meteor.subscribe("durations");

Meteor.defer(() => {
  Durations = new Meteor.Collection("durations");
});

getDurations = function () {
  return Durations.find({}, {sort: {duration: -1}}).fetch();
};

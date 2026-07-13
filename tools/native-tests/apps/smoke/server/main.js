import { Meteor } from "meteor/meteor";

Meteor.publish("ping", function () {
  this.ready();
});

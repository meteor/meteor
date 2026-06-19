import { Meteor } from "meteor/meteor";

Meteor.publish("nativePing", function () {
  this.ready();
});

Meteor.methods({
  nativeEcho(value) {
    return {
      ok: value === "ping",
      echo: value,
    };
  },
});

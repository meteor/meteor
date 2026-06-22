import { Meteor } from "meteor/meteor";

const SERVER_VERSION = "Native server version initial";

Meteor.publish("nativePing", function () {
  this.ready();
});

Meteor.methods({
  nativeEcho(value) {
    return {
      ok: value === "ping",
      echo: value,
      serverVersion: SERVER_VERSION,
    };
  },
});

import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";

Meteor.startup(() => {
  document.getElementById("status").textContent = "Meteor ready";

  Meteor.subscribe("ping");

  Tracker.autorun(() => {
    const status = Meteor.status();
    document.getElementById("ddp").textContent = status.connected
      ? "DDP connected"
      : "DDP connecting";
  });
});

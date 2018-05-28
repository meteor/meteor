import { Meteor } from "meteor/meteor";
import { onPageLoad } from "meteor/server-render";

Meteor.startup(() => {
  // Code to run on server startup.
  console.log(`Greetings from ${module.id}!`);
});

onPageLoad(sink => {
  // Code to run on every request.
  sink.renderIntoElementById(
    "server-render-target",
    `Server time: ${new Date}`
  );
});

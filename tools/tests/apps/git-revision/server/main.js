import { Meteor } from "meteor/meteor";

Meteor.startup(() => {
  const { gitRevision } = __meteor_runtime_config__;
  console.log("__meteor_runtime_config__.gitRevision: " + gitRevision);
});

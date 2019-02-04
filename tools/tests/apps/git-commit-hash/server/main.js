import { Meteor } from "meteor/meteor";

Meteor.startup(() => {
  const { gitCommitHash } = __meteor_runtime_config__;
  console.log("__meteor_runtime_config__.gitCommitHash: " + gitCommitHash);
});

if (process.env.METEOR_HMR_SECRET) {
  __meteor_runtime_config__._hmrSecret = process.env.METEOR_HMR_SECRET;
} else if (process.env.METEOR_PARENT_PID) {
  // if METEOR_PARENT_PID isn't set, then the app isn't being run by the meteor
  // tool and restarting won't enable HRM.
  console.log('Restart Meteor to enable hot module replacement.');
}

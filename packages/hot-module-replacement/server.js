if (!process.env.METEOR_HMR_SECRET) {
  console.log('Restart Meteor to enable hot module replacement.');
} else {
  __meteor_runtime_config__._hmrSecret = process.env.METEOR_HMR_SECRET;
}

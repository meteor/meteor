// Waiting for environment variables to be initialized
Meteor.startup(() => {
  Config = {
    appId: process.env.APP_ID,
    appSecret: process.env.APP_SECRET,
    rootUrl: process.env.ROOT_URL,
    statsServerUrl: process.env.METEOR_PACKAGE_STATS_SERVER_URL || 'http://activity.meteor.com',
    reportRate: process.env.CENSUS_REPORT_RATE || 24 * 60 * 60 * 1000,
    autoSample: Utils.bool(process.env.CENSUS_AUTO_SAMPLE || true),
    reportAttempts: process.env.CENSUS_REPORT_ATTEMPTS || 3
  };

  let shouldSample =
    Config.appId &&
    Config.appSecret &&
    Config.rootUrl &&
    Config.statsServerUrl &&
    Config.autoSample;

  if (shouldSample) Census.startSampling();
});
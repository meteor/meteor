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

  if (!Config.appId)
    Utils.warn("App id is not provided, sampling won't start");
  else if (!Config.appSecret)
    Utils.warn("App secret is not provided, sampling won't start");
  else if (!Config.rootUrl)
    Utils.warn("Root url is not provided, sampling won't start");
  else if (!Config.statsServerUrl)
    Utils.warn("Stats server url is not provided, sampling won't start");
  else if (Config.autoSample)
    Census.startSampling();
});
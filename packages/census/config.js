// Waiting for environment variables to be set
Meteor.startup(function() {
  // Setting config
  Config = {
    appId: process.env.APP_ID,
    appSecret: process.env.APP_SECRET,
    rootUrl: process.env.ROOT_URL,
    statsServerUrl: process.env.METEOR_PACKAGE_STATS_SERVER_URL,
    reportRate: process.env.CENSUS_REPORT_RATE || 24 * 60 * 60 * 1000,
    autoSample: Utils.bool(process.env.CENSUS_AUTO_SAMPLE || true),
    reportAttempts: process.env.CENSUS_REPORT_ATTEMPTS || 3
  };
});
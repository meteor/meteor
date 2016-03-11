// Setting census config
process.env.APP_ID = 'APP_ID';
process.env.APP_SECRET = 'APP_SECRET';
process.env.METEOR_PACKAGE_STATS_SERVER_URL = `${process.env.ROOT_URL}/stats`;
process.env.CENSUS_AUTO_SAMPLE = false;
# Census

Meteor stats sampler and reporter.

#### API

- report(callback) - Sends statistics collected so far. Invoke callback with error and result once finished.
- report.onSuccess(callback) - Registers a callback which will be invoked with the result on success.
- report.onFail(callback) - Registers a callback which will be invoked with the error on fail.
- startSampling() - Starts sampling.
- stopSampling() - Stops sampling.

#### Config

Cenus can be configured by the following enviroment variables:

- APP_ID (required) - The application id.
- APP_ID (required) - The application secret.
- ROOT_URL (required) - The root url of the application.
- METEOR_PACKAGE_STATS_SERVER_URL (required) - The url of the stats server.
- CENSUS_REPORT_ATTEMPTS (optional) - How many attems should census attemps if failed to send stats. Defaults to 5.
- CENSUS_REPORT_RATE (optional) - The rate in milliseconds in which the statistics will be reported. Defaults to 24 hours.
- CENSUS_AUTO_SAMPLE (optional) - Start sampling on startup. Defaults to true.

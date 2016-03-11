# Census

Meteor data sampler and reporter.

#### API

- report(callback) - Sends statistics collected so far. Invoke callback with error and result once finished.
- startSampling() - Starts sampling.
- stopSampling() - Stops sampling.

#### Events

- 'report:success' - Emitted once report has been succeeded. Invokes listener with result.
- 'report:fail' - Emitted once report has been faile. Invokes listener with error.

#### Config

Cenus can be configured by the following enviroment variables:

- APP_ID (required) - The application id.
- APP_ID (required) - The application secret.
- ROOT_URL (required) - The root url of the application.
- METEOR_PACKAGE_STATS_SERVER_URL (required) - The url of the stats server.
- CENSUS_REPORT_ATTEMPTS (optional) - How many attems should census attemps if failed to send stats. Defaults to 5.
- CENSUS_REPORT_RATE (optional) - The rate in milliseconds in which the statistics will be reported. Defaults to 24 hours.
- CENSUS_AUTO_SAMPLE (optional) - Start sampling on startup. Defaults to true.

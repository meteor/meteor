# Census

Meteor data sampler and reporter.

#### API
- startSampling() - starts sampling.
- stopSampling() - stops sampling.

#### Config

Census can be configured by the following environment variables:

- APP_ID (required) - The application id.
- ROOT_URL (required) - The root url of the application.
- METEOR_PACKAGE_STATS_SERVER_URL (required) - The url of the stats server.
- CENSUS_REPORT_ATTEMPTS (optional) - How many attempts should census attempts if failed to send stats. Defaults to 5.
- CENSUS_REPORT_RATE (optional) - The rate in milliseconds in which the statistics will be reported. Defaults to 24 hours.
- CENSUS_AUTO_SAMPLE (optional) - Start sampling on startup. Defaults to true.

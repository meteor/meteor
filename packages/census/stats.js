// env variables
let url;
let attempts;

Meteor.startup(function() {
  url = process.env.METEOR_PACKAGE_STATS_SERVER_URL;
  attempts = process.env.CENSUS_REPORT_ATTEMPTS || 3;
});

function send(data, callback) {
  const options = {
    method: 'PUT',
    url: url,
    attempts: attempts,
    data: data
  };

  Utils.request(options, callback);
}

Stats = { send };

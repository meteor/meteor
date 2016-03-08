const Os = Npm.require('os');
const Request = Npm.require('request');

// Sends a non-blocking request
function request(options, callback) {
  options = _.clone(options);

  // Bind the callback to the environment to prevent blockade
  Request(options, Meteor.bindEnvironment((err, response, body) => {
    const failed = err || response.statusCode != 200;

    // If attempts are still left, keep trying
    if (failed && options.attempts--)
      Utils.request(options, callback);
    // If request has been succeeded or no more attempts left, invoke callback
    else
      callback(err, response, body);
  }));
}

// Gets the ip address
function ip() {
  return _.chain(Os.networkInterfaces())
    .flatten()
    .filter(iface => iface.family == 'IPv4' && !iface.internal)
    .pluck('address')
    .first()
    .value();
}

// Converts string to boolean
function bool(str) {
  return !!JSON.parse(str);
}

Utils = {
  request,
  ip,
  bool
};
const Os = Npm.require('os');

// Sends a non-blocking request
function request(method, url, options, callback) {
  options = _.clone(options);

  HTTP.call(method, url, options, Meteor.bindEnvironment((err, result) => {
    // If attempts are still left, keep trying
    if (err && options.attempts--)
      Utils.request(options, callback);
    // If request has been succeeded or no more attempts left, invoke callback
    else
      callback(err, result);
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
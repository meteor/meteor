const Os = Npm.require('os');
const Request = Npm.require('request');

function request(options, callback) {
  options = _.clone(options);

  Request(options, Meteor.bindEnvironment((err, response, body) => {
    const failed = err || response.statusCode != 200;

    if (failed && options.attempts--)
      this.request(options, callback);
    else
      callback(err, response, body);
  }));
}

function ip() {
  return _.chain(Os.networkInterfaces())
    .flatten()
    .filter(iface => iface.family == 'IPv4' && !iface.internal)
    .pluck('address')
    .first()
    .value();
}

function bool(str) {
  return !!JSON.parse(str);
}

Utils = {
  request,
  ip,
  bool
};
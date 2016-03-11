const Os = Npm.require('os');

Utils = {
  // Sends a non-blocking request
  request(method, url, options, callback) {
    options = _.clone(options);

    HTTP.call(method, url, options, Meteor.bindEnvironment((err, result) => {
      // If attempts are still left, keep trying
      if (err && options.attempts--)
        Utils.request(options, callback);
      // If request has been succeeded or no more attempts left, invoke callback
      else
        callback(err, result);
    }));
  },

  // Gets the ip address
  ip() {
    return _.chain(Os.networkInterfaces())
      .flatten()
      .filter(iface => iface.family == 'IPv4' && !iface.internal)
      .pluck('address')
      .first()
      .value();
  },

  // Prints a warning to console
  warn(msg) {
    console.warn(`Census warning: ${msg}`);
  },

  // Converts string to boolean
  bool(str) {
    return !!JSON.parse(str);
  }
};
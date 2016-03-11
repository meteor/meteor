const Os = Npm.require('os');

Stats = {
  // Returns current sessions number
  get currSessions() {
    return _.size(Meteor.default_server.sessions);
  },

  // Sends a request to stats server
  send(data, cb) {
    const options = {
      data: data,
      attempts: Config.reportAttempts
    };

    Utils.request('PUT', Config.statsServerUrl, options, cb);
  },

  // Composes stats data
  compose() {
    return {
      properties: {
        appId: Config.appId,
        appSecret: Config.appSecret,
        rootUrl: Config.rootUrl,
        version: Meteor.release,
        maxSessions: Stats.maxSessions
      },
      context: {
        app:{
          name: Census.name,
          version: Census.version
        },
        ip: Utils.ip(),
        os: {
          name: Os.platform(),
          version: Os.release()
        }
      }
    };
  }
};

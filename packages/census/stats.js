const Os = Npm.require('os');

Stats = {
  // Stats data variables which will be updated by other modules
  currSessions: 0,
  maxSessions: 0,

  // Sends a request to stats server
  send(data, cb) {
    const options = {
      data: data,
      attempts: Config.reportAttempts
    }

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
        maxSessions: Stats._maxSessions
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

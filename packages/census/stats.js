// Sends statistics to stats server
function send(data, callback) {
  const options = {
    data: data,
    attempts: Config.reportAttempts
  }

  Utils.request('PUT', Config.statsServerUrl, options, callback);
}

Stats = { send };

// Sends statistics to stats server
function send(data, callback) {
  const options = {
    method: 'PUT',
    url: Config.statsServerUrl,
    attempts: Config.reportAttempts,
    data: data
  };

  Utils.request(options, callback);
}

Stats = { send };

Accounts.addAutopublishFields({
  // not sure whether the github api can be used from the browser,
  // thus not sure if we should be sending access tokens; but we do it
  // for all other oauth2 providers, and it may come in handy.
  forLoggedInUser: ['services.github'],
  forOtherUsers: ['services.github.username']
});

Accounts.oauth.registerService('github', 2, function(query) {

  var accessToken = getAccessToken(query);
  var identity = getIdentity(accessToken);

  return {
    serviceData: {
      id: identity.id,
      accessToken: accessToken,
      email: identity.email,
      username: identity.login
    },
    options: {profile: {name: identity.name}}
  };
});

var getAccessToken = function (query) {
  var config = Accounts.loginServiceConfiguration.findOne({service: 'github'});
  if (!config)
    throw new Accounts.ConfigError("Service not configured");

  var response;
  try {
    response = Meteor.http.post(
      "https://github.com/login/oauth/access_token", {
        headers: {Accept: 'application/json'},
        params: {
          code: query.code,
          client_id: config.clientId,
          client_secret: config.secret,
          redirect_uri: Meteor.absoluteUrl("_oauth/github?close"),
          state: query.state
        }
      });
  } catch (err) {
    throw new Error("Failed to complete OAuth handshake with GitHub. " +
                    err + (err.response ? ": " + err.response.content : ""));
  }
  if (response.data.error) { // if the http response was a json object with an error attribute
    throw new Error("Failed to complete OAuth handshake with GitHub. " + response.data.error);
  } else {
    return response.data.access_token;
  }
};

var getIdentity = function (accessToken) {
  try {
    var userAgent = "Meteor";
    if (Meteor.release)
      userAgent += "/" + Meteor.release;

    return Meteor.http.get(
      "https://api.github.com/user", {
        headers: {"User-Agent": userAgent}, // http://developer.github.com/v3/#user-agent-required
        params: {access_token: accessToken}
      }).data;
  } catch (err) {
    throw new Error("Failed to fetch identity from GitHub. " +
                    err + (err.response ? ": " + err.response.content : ""));
  }
};

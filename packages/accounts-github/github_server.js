// with autopublish on: publish all fields to the logged in user;
// only the user's github username to others
Accounts._autopublishFields.loggedInUser.push('services.github');
Accounts._autopublishFields.allUsers.push('services.github.username');

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

  var result = Meteor.http.post(
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

  if (result.error) { // if the http response was an error
    throw new Error("Failed to complete OAuth handshake with GitHub. " +
                    "HTTP Error " + result.statusCode + ": " + result.content);
  } else if (result.data.error) { // if the http response was a json object with an error attribute
    throw new Error("Failed to complete OAuth handshake with GitHub. " + result.data.error);
  } else {
    return result.data.access_token;
  }
};

var getIdentity = function (accessToken) {
  var result = Meteor.http.get(
    "https://api.github.com/user",
    {params: {access_token: accessToken}});
  if (result.error) {
    throw new Error("Failed to fetch identity from GitHub. " +
                    "HTTP Error " + result.statusCode + ": " + result.content);
  } else {
    return result.data;
  }
};

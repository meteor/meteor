MeteorDeveloperAccounts = {};

Oauth.registerService("meteor-developer", 2, null, function (query) {
  var response = getTokens(query);
  var accessToken = response.accessToken;
  var identity = getIdentity(accessToken);

  var serviceData = {
    accessToken: accessToken,
    expiresAt: (+new Date) + (1000 * response.expiresIn)
  };

  _.extend(serviceData, identity);

  // only set the token in serviceData if it's there. this ensures
  // that we don't lose old ones (since we only get this on the first
  // log in attempt)
  if (response.refreshToken)
    serviceData.refreshToken = response.refreshToken;

  return {
    serviceData: serviceData,
    options: {profile: {name: serviceData.username}}
    // XXX use username for name until meteor accounts has a profile with a name
  };
});

// returns an object containing:
// - accessToken
// - expiresIn: lifetime of token in seconds
// - refreshToken, if this is the first authorization request and we got a
//   refresh token from the server
var getTokens = function (query) {
  var config = ServiceConfiguration.configurations.findOne({
    service: 'meteor-developer'
  });
  if (!config)
    throw new ServiceConfiguration.ConfigError("Service not configured");

  var response;
  try {
    response = HTTP.post(
      METEOR_DEVELOPER_URL + "/oauth2/token", {
        params: {
          grant_type: "authorization_code",
          code: query.code,
          client_id: config.clientId,
          client_secret: config.secret,
          redirect_uri: Meteor.absoluteUrl("_oauth/meteor-developer?close")
        }
      }
    );
  } catch (err) {
    throw _.extend(
      new Error(
        "Failed to complete OAuth handshake with Meteor developer accounts. "
          + err.message
      ),
      {response: err.response}
    );
  }

  if (! response.data || response.data.error) {
    // if the http response was a json object with an error attribute
    throw new Error(
      "Failed to complete OAuth handshake with Meteor developer accounts. " +
        (response.data ? response.data.error :
         "No response data")
    );
  } else {
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in
    };
  }
};

var getIdentity = function (accessToken) {
  try {
    return HTTP.get(
      METEOR_DEVELOPER_URL + "/api/v1/identity",
      {
        headers: { Authorization: "Bearer " + accessToken }
      }
    ).data;
  } catch (err) {
    throw _.extend(
      new Error("Failed to fetch identity from Meteor developer accounts. " +
                err.message),
      {response: err.response}
    );
  }
};

MeteorDeveloperAccounts.retrieveCredential = function (credentialToken) {
  return Oauth.retrieveCredential(credentialToken);
};

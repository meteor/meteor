Meetup = {};

Oauth.registerService('meetup', 2, null, function(query) {

  var accessToken = getAccessToken(query);
  var identity = getIdentity(accessToken);

  return {
    serviceData: {
      id: identity.id,
      accessToken: accessToken
    },
    options: {profile: {name: identity.name}}
  };
});

var getAccessToken = function (query) {
  var config = ServiceConfiguration.configurations.findOne({service: 'meetup'});
  if (!config)
    throw new ServiceConfiguration.ConfigError("Service not configured");

  var response;
  try {
    response = HTTP.post(
      "https://secure.meetup.com/oauth2/access", {headers: {Accept: 'application/json'}, params: {
        code: query.code,
        client_id: config.clientId,
        client_secret: config.secret,
        grant_type: 'authorization_code',
        redirect_uri: Meteor.absoluteUrl("_oauth/meetup?close"),
        state: query.state
      }});
  } catch (err) {
    throw _.extend(new Error("Failed to complete OAuth handshake with Meetup. " + err.message),
                   {response: err.response});
  }

  if (response.data.error) { // if the http response was a json object with an error attribute
    throw new Error("Failed to complete OAuth handshake with Meetup. " + response.data.error);
  } else {
    return response.data.access_token;
  }
};

var getIdentity = function (accessToken) {
  try {
    var response = HTTP.get(
      "https://secure.meetup.com/2/members",
      {params: {member_id: 'self', access_token: accessToken}});
    return response.data.results && response.data.results[0];
  } catch (err) {
    throw _.extend(new Error("Failed to fetch identity from Meetup. " + err.message),
                   {response: err.response});
  }
};


Meetup.retrieveCredential = function(credentialToken) {
  return Oauth.retrieveCredential(credentialToken);
};

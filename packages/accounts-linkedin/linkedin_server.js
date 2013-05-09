var url_util = Npm.require('url');

Accounts.oauth.registerService('linkedin', 2, function(query) {

  var response = getTokens(query);

  var accessToken = response.accessToken;

  var identity = getIdentity(accessToken);

  var profile_url = identity.siteStandardProfileRequest.url;
  var url_parts = url_util.parse(profile_url, true);

  return {
    serviceData: {
      id: url_parts.query.id || Random.id(),
      accessToken: accessToken,
      expiresAt: (+new Date) + (1000 * response.expiresIn)
    },
    options: {
      profile: {
        name: identity.firstName + ' ' + identity.lastName
      }
    }
  };
});

var getTokens = function (query) {
  var config = Accounts.loginServiceConfiguration.findOne({service: 'linkedin'});
  if (!config)
    throw new Accounts.ConfigError("Service not configured");

  var result = Meteor.http.post(
    "https://api.linkedin.com/uas/oauth2/accessToken", {
      params: {
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.secret,
        code: query.code,
        redirect_uri: Meteor.absoluteUrl("_oauth/linkedin?close")
      }
    });

  if (result.error) { // if the http response was an error
    throw new Error("Failed to complete OAuth handshake with LinkedIn. " +
                    "HTTP Error " + result.statusCode + ": " + result.content);
                    document.write('Hello world');
  } else if (result.data.error) { // if the http response was a json object with an error attribute

    throw new Error("Failed to complete OAuth handshake with LinkedIn. " + result.data.error);
  } else {
    return {
      accessToken: result.data.access_token,
      expiresIn: result.data.expires_in
    };
  }
};

var getIdentity = function (accessToken) {
  var result = Meteor.http.get(
    "https://www.linkedin.com/v1/people/~", {
      params: {
        oauth2_access_token: accessToken,
        format: 'json'
      }
    });
  if (result.error) {
    throw new Error("Failed to fetch identity from LinkedIn. " +
                    "HTTP Error " + result.statusCode + ": " + result.content);
  } else {
    return result.data;
  }
};

Accounts.oauth.registerService('weibo', 2, function(query) {

  var response = getTokenResponse(query);
  var uid = parseInt(response.uid, 10);

  // different parts of weibo's api seem to expect numbers, or strings
  // for uid. let's make sure they're both the same.
  if (response.uid !== uid + "")
    throw new Error("Expected 'uid' to parse to an integer: " + JSON.stringify(response));

  var identity = getIdentity(response.access_token, uid);

  return {
    serviceData: {
      // We used to store this as a string, so keep it this way rather than
      // add complexity to Account.updateOrCreateUserFromExternalService or
      // force a database migration
      id: uid + "",
      accessToken: response.access_token,
      screenName: identity.screen_name,
      expiresAt: (+new Date) + (1000 * response.expires_in)
    },
    options: {profile: {name: identity.screen_name}}
  };
});

// return an object containining:
// - uid
// - access_token
// - expires_in: lifetime of this token in seconds (5 years(!) right now)
var getTokenResponse = function (query) {
  var config = Accounts.loginServiceConfiguration.findOne({service: 'weibo'});
  if (!config)
    throw new Accounts.ConfigError("Service not configured");

  var result = Meteor.http.post(
    "https://api.weibo.com/oauth2/access_token", {params: {
      code: query.code,
      client_id: config.clientId,
      client_secret: config.secret,
      redirect_uri: Meteor.absoluteUrl("_oauth/weibo?close", {replaceLocalhost: true}),
      grant_type: 'authorization_code'
    }});

  if (result.error) { // if the http response was an error
    throw new Error("Failed to complete OAuth handshake with Weibo. " +
                    "HTTP Error " + result.statusCode + ": " + result.content);
  }

  // result.headers["content-type"] is 'text/plain;charset=UTF-8', so
  // the http package doesn't automatically populate result.data
  result.data = JSON.parse(result.content);

  if (result.data.error) { // if the http response was a json object with an error attribute
    throw new Error("Failed to complete OAuth handshake with Weibo. " + result.data.error);
  } else {
    return result.data;
  }
};

var getIdentity = function (accessToken, userId) {
  var result = Meteor.http.get(
    "https://api.weibo.com/2/users/show.json",
    {params: {access_token: accessToken, uid: userId}});

  if (result.error) {
    throw new Error("Failed to fetch identity from Weibo. " +
                    "HTTP Error " + result.statusCode + ": " + result.content);
  } else {
    return result.data;
  }
};

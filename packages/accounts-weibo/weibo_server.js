Accounts.addAutopublishFields({
  // publish all fields including access token, which can legitimately
  // be used from the client (if transmitted over ssl or on localhost)
  forLoggedInUser: ['services.weibo'],
  forOtherUsers: ['services.weibo.screenName']
});

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

  var response;
  try {
    response = Meteor.http.post(
      "https://api.weibo.com/oauth2/access_token", {params: {
        code: query.code,
        client_id: config.clientId,
        client_secret: config.secret,
        redirect_uri: Meteor.absoluteUrl("_oauth/weibo?close", {replaceLocalhost: true}),
        grant_type: 'authorization_code'
      }});
  } catch (err) {
    console.error("Error completing OAuth handshake with Weibo:");
    throw err;
  }

  // result.headers["content-type"] is 'text/plain;charset=UTF-8', so
  // the http package doesn't automatically populate result.data
  response.data = JSON.parse(response.content);

  if (response.data.error) { // if the http response was a json object with an error attribute
    throw new Error("Failed to complete OAuth handshake with Weibo. " + response.data.error);
  } else {
    return response.data;
  }
};

var getIdentity = function (accessToken, userId) {
  try {
    return Meteor.http.get(
      "https://api.weibo.com/2/users/show.json",
      {params: {access_token: accessToken, uid: userId}}).data;
  } catch (err) {
    console.error("Error fetching identity from Weibo:");
    throw err;
  }
};

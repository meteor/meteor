(function () {

  Accounts.oauth.registerService('google', 2, function(query) {

    var response = getTokens(query);
    var accessToken = response.access_token;
    var identity = getIdentity(accessToken);

    var serviceData = {
      id: identity.id,
      accessToken: accessToken,
      email: identity.email
    };

    // only set the token in serviceData if it's there. this ensures
    // that we don't lose old ones (since we only get this on the first
    // log in attempt)
    if (response.refresh_token)
      serviceData.refreshToken = response.refresh_token;

    return {
      serviceData: serviceData,
      options: {profile: {name: identity.name}}
    };
  });

  // returns an object containing access_token, and if this is the first
  // authorization request also refresh_token
  var getTokens = function (query) {
    var config = Accounts.loginServiceConfiguration.findOne({service: 'google'});
    if (!config)
      throw new Accounts.ConfigError("Service not configured");

    var result = Meteor.http.post(
      "https://accounts.google.com/o/oauth2/token", {params: {
        code: query.code,
        client_id: config.clientId,
        client_secret: config.secret,
        redirect_uri: Meteor.absoluteUrl("_oauth/google?close"),
        grant_type: 'authorization_code'
      }});

    if (result.error) // if the http response was an error
      throw result.error;
    if (result.data.error) // if the http response was a json object with an error attribute
      throw result.data;
    return result.data;
  };

  var getIdentity = function (accessToken) {
    var result = Meteor.http.get(
      "https://www.googleapis.com/oauth2/v1/userinfo",
      {params: {access_token: accessToken}});

    if (result.error)
      throw result.error;
    return result.data;
  };
})();

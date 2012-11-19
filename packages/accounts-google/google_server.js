(function () {

  Accounts.oauth.registerService('google', 2, function(query) {

    var response = getAccessToken(query);
    var accessToken = response.access_token;
    var refreshToken = response.refresh_token;
    var identity = getIdentity(accessToken);

    if (!refreshToken) {

        // Not all responses will include a refresh token, and we don't want to override an existing one with a null
        // value if we actually already have one.
        refreshToken = getRefreshToken(identity.id);
    }

    return {
                serviceData: {
                  id: identity.id,
                  accessToken: accessToken,
                  refreshToken: refreshToken,
                  email: identity.email
                },
                options: {profile: {name: identity.name}}
           };
  });

  var getAccessToken = function (query) {
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

  var getRefreshToken = function (id) {
      var user = Meteor.users.findOne({'services.google.id': id});
      if (!user)
        return null;

      return user.services.google.refreshToken;
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

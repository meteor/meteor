(function () {

  Accounts.oauth.registerService('google', 2, function(query) {

    var accessObject = getAccessObject(query);
    var identity = getIdentity(accessObject.accessToken);

    return {
      serviceData: {
        id: identity.id,
        accessToken: accessObject.accessToken,
        expiresAt: new Date().getTime() + (1000 * parseInt(accessObject.expiresIn, 10)),
        email: identity.email
      },
      options: {profile: {name: identity.name}}
    };
  });

  var getAccessObject = function (query) {
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
    return {
      accessToken: result.data.access_token,
      expiresIn: result.data.expires_in
    };
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

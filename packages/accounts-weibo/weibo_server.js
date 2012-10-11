(function () {

  Accounts.oauth.registerService('weibo', 2, function(query) {

    var accessToken = getAccessToken(query);
    var identity = getIdentity(accessToken.access_token, parseInt(accessToken.uid, 10));

    return {
      serviceData: {
        id: accessToken.uid,
        accessToken: accessToken.access_token,
        screenName: identity.screen_name
      },
      options: {profile: {name: identity.screen_name}}
    };
  });

  var getAccessToken = function (query) {
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

    if (result.error) // if the http response was an error
      throw result.error;
    if (typeof result.content === "string")
      result.content = JSON.parse(result.content);
    if (result.content.error) // if the http response was a json object with an error attribute
      throw result.content;
    return result.content;
  };

  var getIdentity = function (accessToken, userId) {
    var result = Meteor.http.get(
      "https://api.weibo.com/2/users/show.json",
      {params: {access_token: accessToken, uid: userId}});

    if (result.error)
      throw result.error;
    return result.data;
  };
})();

(function () {

  Meteor.accounts.weibo.setSecret = function (secret) {
    Meteor.accounts.weibo._secret = secret;
  };

  Meteor.accounts.oauth.registerService('weibo', 2, function(query) {

    var accessToken = getAccessToken(query);
    var identity = getIdentity(accessToken.access_token, parseInt(accessToken.uid, 10));

    return {
      options: {
        services: {
          weibo: {
            id: accessToken.uid,
            accessToken: accessToken.access_token,
            screenName: identity.screen_name
          }
        }
      },
      extra: {name: identity.screen_name}
    };
  });

  var getAccessToken = function (query) {
    var result = Meteor.http.post(
      "https://api.weibo.com/oauth2/access_token", {params: {
        code: query.code,
        client_id: Meteor.accounts.weibo._clientId,
        client_secret: Meteor.accounts.weibo._secret,
        redirect_uri: Meteor.accounts.weibo._appUrl + "/_oauth/weibo?close",
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

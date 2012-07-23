(function () {

  Meteor.accounts.weibo.setSecret = function (secret) {
    Meteor.accounts.weibo._secret = secret;
  };

  Meteor.accounts.oauth2.registerService('weibo', function(query) {
    if (query.error) {
      // The user didn't authorize access
      return null;
    }

    if (!Meteor.accounts.weibo._clientId || !Meteor.accounts.weibo._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.weibo.config first");
    if (!Meteor.accounts.weibo._secret)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.weibo.setSecret first");

    var result = getAccessToken(query);
    var identity = getIdentity(result.access_token, parseInt(result.uid, 10));

    return {
      options: {
        services: {
          weibo: {
            id: result.uid,
            accessToken: result.accessToken,
            screenName: identity.screen_name
          }
        }
      }
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

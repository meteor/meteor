(function () {

  Meteor.accounts.google.setSecret = function (secret) {
    Meteor.accounts.google._secret = secret;
  };

  Meteor.accounts.oauth.registerService('google', 2, function(query) {

    var accessToken = getAccessToken(query);
    var identity = getIdentity(accessToken);

    return {
      options: {
        email: identity.email,
        services: {google: {id: identity.id, accessToken: accessToken}}
      },
      extra: {name: identity.name}
    };
  });

  var getAccessToken = function (query) {
    var result = Meteor.http.post(
      "https://accounts.google.com/o/oauth2/token", {params: {
        code: query.code,
        client_id: Meteor.accounts.google._clientId,
        client_secret: Meteor.accounts.google._secret,
        redirect_uri: Meteor.accounts.google._appUrl + "/_oauth/google?close",
        grant_type: 'authorization_code'
      }});

    if (result.error) // if the http response was an error
      throw result.error;
    if (result.data.error) // if the http response was a json object with an error attribute
      throw result.data;
    return result.data.access_token;
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

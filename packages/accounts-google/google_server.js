(function () {
  Meteor.accounts.google.setSecret = function (secret) {
    Meteor.accounts.google._secret = secret;
  };

  Meteor.accounts.oauth2.providers.google = {
    userIdForOauthReq: function(req) {
      var accessToken = getAccessToken(req);

      // XXX can we generalize this flow into the oauth abstraction?
      if (!accessToken)
        return null;

      var identity = Meteor.http.get(
        "https://www.googleapis.com/oauth2/v1/userinfo",
          {params: {access_token: accessToken}}).data;

      return Meteor.accounts.updateOrCreateUser(
        identity.email, 'google', identity.id,
        {accessToken: accessToken});
    }
  };

  var getAccessToken = function (req) {
    if (req.query.error) {
      // The user didn't authorize access
      // XXX can we generalize this into the oauth abstration?
      return null;
    }

    var response = Meteor.http.post(
      "https://accounts.google.com/o/oauth2/token", {params: {
        code: req.query.code,
        client_id: Meteor.accounts.google._clientId,
        client_secret: Meteor.accounts.google._secret,
        redirect_uri: Meteor.accounts.google._appUrl + "/_oauth/google?close",
        grant_type: 'authorization_code'
      }}).data;

    if (response.error)
      throw response;

    return response.access_token;
  };
})();
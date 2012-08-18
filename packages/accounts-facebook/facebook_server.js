(function () {

  Meteor.accounts.facebook.setSecret = function (secret) {
    Meteor.accounts.facebook._secret = secret;
  };

  Meteor.accounts.oauth.registerService('facebook', 2, function(query) {

    var accessToken = getAccessToken(query);
    var identity = getIdentity(accessToken);

    return {
      options: {
        email: identity.email,
        services: {facebook: {id: identity.id, accessToken: accessToken}}
      },
      extra: {name: identity.name}
    };
  });

  var getAccessToken = function (query) {
    // Request an access token
    var result = Meteor.http.get(
      "https://graph.facebook.com/oauth/access_token", {
        params: {
          client_id: Meteor.accounts.facebook._appId,
          redirect_uri: Meteor.accounts.facebook._appUrl + "/_oauth/facebook?close",
          client_secret: Meteor.accounts.facebook._secret,
          code: query.code
        }
      });

    if (result.error)
      throw result.error;
    var response = result.content;

    // Errors come back as JSON but success looks like a query encoded
    // in a url
    var error_response;
    try {
      // Just try to parse so that we know if we failed or not,
      // while storing the parsed results
      error_response = JSON.parse(response);
    } catch (e) {
      error_response = null;
    }

    if (error_response) {
      throw new Meteor.Error(500, "Error trying to get access token from Facebook", error_response);
    } else {
      // Success!  Extract the facebook access token from the
      // response
      var fbAccessToken;
      _.each(response.split('&'), function(kvString) {
        var kvArray = kvString.split('=');
        if (kvArray[0] === 'access_token')
          fbAccessToken = kvArray[1];
        // XXX also parse the "expires" argument?
      });

      if (!fbAccessToken)
        throw new Meteor.Error(500, "Couldn't find access token in HTTP response.");
      return fbAccessToken;
    }
  };

  var getIdentity = function (accessToken) {
    var result = Meteor.http.get("https://graph.facebook.com/me", {
      params: {access_token: accessToken}});

    if (result.error)
      throw result.error;
    return result.data;
  };
}) ();

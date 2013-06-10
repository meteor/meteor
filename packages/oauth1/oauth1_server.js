// A place to store request tokens pending verification
Oauth1._requestTokens = {};

// connect middleware
Oauth1._handleRequest = function (service, query, res) {

  var config = ServiceConfiguration.configurations.findOne({service: service.serviceName});
  if (!config) {
    throw new ServiceConfiguration.ConfigError("Service " + service.serviceName + " not configured");
  }

  var urls = service.urls;
  var oauthBinding = new OAuth1Binding(
    config.consumerKey, config.secret, urls);

  if (query.requestTokenAndRedirect) {
    // step 1 - get and store a request token

    // Get a request token to start auth process
    oauthBinding.prepareRequestToken(query.requestTokenAndRedirect);

    // Keep track of request token so we can verify it on the next step
    Oauth1._requestTokens[query.state] = oauthBinding.requestToken;

    // redirect to provider login, which will redirect back to "step 2" below
    var redirectUrl = urls.authenticate + '?oauth_token=' + oauthBinding.requestToken;
    res.writeHead(302, {'Location': redirectUrl});
    res.end();
  } else {
    // step 2, redirected from provider login - complete the login
    // process: if the user authorized permissions, get an access
    // token and access token secret and log in as user

    // Get the user's request token so we can verify it and clear it
    var requestToken = Oauth1._requestTokens[query.state];
    delete Oauth1._requestTokens[query.state];

    // Verify user authorized access and the oauth_token matches
    // the requestToken from previous step
    if (query.oauth_token && query.oauth_token === requestToken) {

      // Prepare the login results before returning.  This way the
      // subsequent call to the `login` method will be immediate.

      // Get the access token for signing requests
      oauthBinding.prepareAccessToken(query);

      // Run service-specific handler.
      var oauthResult = service.handleOauthRequest(oauthBinding);

      // Add the login result to the result map
      Oauth._loginResultForCredentialToken[query.state] = {
          serviceName: service.serviceName,
          serviceData: oauthResult.serviceData,
          options: oauthResult.options
        };
    }

    // Either close the window, redirect, or render nothing
    // if all else fails
    Oauth._renderOauthResults(res, query);
  }
};

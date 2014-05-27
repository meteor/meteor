// connect middleware
OAuth._requestHandlers['1'] = function (service, query, res) {

  var config = ServiceConfiguration.configurations.findOne({service: service.serviceName});
  if (!config) {
    throw new ServiceConfiguration.ConfigError(service.serviceName);
  }

  var urls = service.urls;
  var oauthBinding = new OAuth1Binding(config, urls);

  if (query.requestTokenAndRedirect) {
    // step 1 - get and store a request token
    var callbackUrl = Meteor.absoluteUrl("_oauth/" + service.serviceName +
                                         "?close&state=" +
                                         query.state);

    // Get a request token to start auth process
    oauthBinding.prepareRequestToken(callbackUrl);

    // Keep track of request token so we can verify it on the next step
    OAuth._storeRequestToken(query.state,
      oauthBinding.requestToken,
      oauthBinding.requestTokenSecret
    );

    // support for scope/name parameters
    var redirectUrl = undefined;
    if(typeof urls.authenticate === "function") {
      redirectUrl = urls.authenticate(oauthBinding);
    } else {
      redirectUrl = urls.authenticate + '?oauth_token=' + oauthBinding.requestToken;
    }

    // redirect to provider login, which will redirect back to "step 2" below
    res.writeHead(302, {'Location': redirectUrl});
    res.end();
  } else {
    // step 2, redirected from provider login - store the result
    // and close the window to allow the login handler to proceed

    // Get the user's request token so we can verify it and clear it
    var requestTokenInfo = OAuth._retrieveRequestToken(query.state);

    // Verify user authorized access and the oauth_token matches
    // the requestToken from previous step
    if (query.oauth_token && query.oauth_token === requestTokenInfo.requestToken) {

      // Prepare the login results before returning.  This way the
      // subsequent call to the `login` method will be immediate.

      // Get the access token for signing requests
      oauthBinding.prepareAccessToken(query, requestTokenInfo.requestTokenSecret);

      // Run service-specific handler.
      var oauthResult = service.handleOauthRequest(oauthBinding);

      var credentialSecret = Random.secret();

      // Store the login result so it can be retrieved in another
      // browser tab by the result handler
      OAuth._storePendingCredential(query.state, {
        serviceName: service.serviceName,
        serviceData: oauthResult.serviceData,
        options: oauthResult.options
      }, credentialSecret);
    }

    // Either close the window, redirect, or render nothing
    // if all else fails
    OAuth._renderOauthResults(res, query, credentialSecret);
  }
};

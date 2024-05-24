import url from 'url';
import { OAuth1Binding } from './oauth1_binding';

OAuth._queryParamsWithAuthTokenUrl = (authUrl, oauthBinding, params = {}, whitelistedQueryParams = []) => {
  const redirectUrlObj = url.parse(authUrl, true);

  Object.assign(
    redirectUrlObj.query,
    whitelistedQueryParams.reduce((prev, param) =>
      params.query[param] ? { ...prev, param: params.query[param] } : prev,
      {}
    ),
    {
      oauth_token: oauthBinding.requestToken,
    }
  );

  // Clear the `search` so it is rebuilt by Node's `url` from the `query` above.
  // Using previous versions of the Node `url` module, this was just set to ""
  // However, Node 6 docs seem to indicate that this should be `undefined`.
  delete redirectUrlObj.search;

  // Reconstruct the URL back with provided query parameters merged with oauth_token
  return url.format(redirectUrlObj);
};

// connect middleware
OAuth._requestHandlers['1'] = async (service, query, res) => {
  const config = ServiceConfiguration.configurations.findOne({service: service.serviceName});
  if (! config) {
    throw new ServiceConfiguration.ConfigError(service.serviceName);
  }

  const { urls } = service;
  const oauthBinding = new OAuth1Binding(config, urls);

  let credentialSecret;

  if (query.requestTokenAndRedirect) {
    // step 1 - get and store a request token
    const callbackUrl = OAuth._redirectUri(service.serviceName, config, {
      state: query.state,
      cordova: (query.cordova === "true"),
      android: (query.android === "true")
    });

    // Get a request token to start auth process
    await oauthBinding.prepareRequestToken(callbackUrl);

    // Keep track of request token so we can verify it on the next step
    OAuth._storeRequestToken(
      OAuth._credentialTokenFromQuery(query),
      oauthBinding.requestToken,
      oauthBinding.requestTokenSecret);

    // support for scope/name parameters
    let redirectUrl;
    const authParams = { query };

    if(typeof urls.authenticate === "function") {
      redirectUrl = urls.authenticate(oauthBinding, authParams);
    } else {
      redirectUrl = OAuth._queryParamsWithAuthTokenUrl(
        urls.authenticate,
        oauthBinding,
        authParams
      );
    }

    // redirect to provider login, which will redirect back to "step 2" below

    res.writeHead(302, {'Location': redirectUrl});
    res.end();
  } else {
    // step 2, redirected from provider login - store the result
    // and close the window to allow the login handler to proceed

    // Get the user's request token so we can verify it and clear it
    const requestTokenInfo = OAuth._retrieveRequestToken(
      OAuth._credentialTokenFromQuery(query));

    if (! requestTokenInfo) {
      throw new Error("Unable to retrieve request token");
    }

    // Verify user authorized access and the oauth_token matches
    // the requestToken from previous step
    if (query.oauth_token && query.oauth_token === requestTokenInfo.requestToken) {

      // Prepare the login results before returning.  This way the
      // subsequent call to the `login` method will be immediate.

      // Get the access token for signing requests
      await oauthBinding.prepareAccessToken(query, requestTokenInfo.requestTokenSecret);

      // Run service-specific handler.
      const oauthResult = await service.handleOauthRequest(
        oauthBinding, { query: query });

      const credentialToken = OAuth._credentialTokenFromQuery(query);
      credentialSecret = Random.secret();

      // Store the login result so it can be retrieved in another
      // browser tab by the result handler
      OAuth._storePendingCredential(credentialToken, {
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

// connect middleware
OAuth._requestHandlers['2'] = async (service, query, res) => {
  let credentialSecret;

  // check if user authorized access
  if (!query.error) {
    // Prepare the login results before returning.

    // Run service-specific handler.
    const oauthResult = await service.handleOauthRequest(query);
    credentialSecret = Random.secret();

    const credentialToken = OAuth._credentialTokenFromQuery(query);

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
};

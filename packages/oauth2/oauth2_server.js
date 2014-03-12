// connect middleware
Oauth._requestHandlers['2'] = function (service, query, res) {
  // check if user authorized access
  if (!query.error) {
    // Prepare the login results before returning.

    // Run service-specific handler.
    var oauthResult = service.handleOauthRequest(query);

    // Store the login result so it can be retrieved in another
    // browser tab by the result handler
    Oauth._storeTransientResult(query.state, {
      serviceName: service.serviceName,
      serviceData: oauthResult.serviceData,
      options: oauthResult.options
    });

  }

  // Either close the window, redirect, or render nothing
  // if all else fails
  Oauth._renderOauthResults(res, query);
};

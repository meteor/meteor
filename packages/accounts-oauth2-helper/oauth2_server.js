(function () {
  var connect = __meteor_bootstrap__.require("connect");

  // connect middleware
  Accounts.oauth2._handleRequest = function (service, query, res) {
    // check if user authorized access
    if (!query.error) {
      // Prepare the login results before returning.  This way the
      // subsequent call to the `login` method will be immediate.

      // Run service-specific handler.
      var oauthResult = service.handleOauthRequest(query);

      // Get or create user doc and login token for reconnect.
      Accounts.oauth._loginResultForState[query.state] =
        Accounts.updateOrCreateUserFromExternalService(
          service.serviceName, oauthResult.serviceData, oauthResult.options);
    }

    // Either close the window, redirect, or render nothing
    // if all else fails
    Accounts.oauth._renderOauthResults(res, query);
  };

})();

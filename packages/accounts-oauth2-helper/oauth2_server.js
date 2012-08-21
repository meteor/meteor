(function () {
  var connect = __meteor_bootstrap__.require("connect");

  // connect middleware
  Meteor.accounts.oauth2._handleRequest = function (service, query, res) {
    if (query.error) {
      // The user didn't authorize access
      return;
    }

    // Make sure we prepare the login results before returning.
    // This way the subsequent call to the `login` method will be
    // immediate.

    try {
      // Get or create user id
      var oauthResult = service.handleOauthRequest(query);

      var userId = Meteor.accounts.updateOrCreateUser(
        oauthResult.options, oauthResult.extra);

      // Generate and store a login token for reconnect
      // XXX this could go in accounts_server.js instead
      var loginToken = Meteor.accounts._loginTokens.insert({userId: userId});

      // Store results to subsequent call to `login`
      Meteor.accounts.oauth._loginResultForState[query.state] =
        {token: loginToken, id: userId};
    } catch (err) {
      // if we got thrown an error, save it off, it will get passed to
      // the approporiate login call (if any) and reported there.
      //
      // The other option would be to display it in the popup tab that
      // is still open at this point, ignoring the 'close' or 'redirect'
      // we were passed. But then the developer wouldn't be able to
      // style the error or react to it in any way.
      if (query.state && err instanceof Error)
        Meteor.accounts.oauth._loginResultForState[query.state] = err;

      // also log to the server console, so the developer sees it.
      Meteor._debug("Exception in oauth2 handler", err);
    }

    // Either close the window, redirect, or render nothing
    // if all else fails
    Meteor.accounts.oauth._renderOauthResults(res, query);
  };

})();

(function () {
  var connect = __meteor_bootstrap__.require("connect");

  // connect middleware
  Meteor.accounts.oauth2._handleRequest = function (service, query, res) {
    // check if user authorized access
    if (!query.error) {
      // Prepare the login results before returning.  This way the
      // subsequent call to the `login` method will be immediate.

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
    }

    // Either close the window, redirect, or render nothing
    // if all else fails
    Meteor.accounts.oauth._renderOauthResults(res, query);
  };

})();

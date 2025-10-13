// NOTE: This file is added to the client as asset and hence ecmascript package has no effect here.
(function() {

  var config = JSON.parse(document.getElementById("config").innerHTML);

  if (config.setCredentialToken) {
    var credentialToken = config.credentialToken;
    var credentialSecret = config.credentialSecret;

    if (config.isCordova) {
      var credentialString = JSON.stringify({
        credentialToken: credentialToken,
        credentialSecret: credentialSecret
      });

      window.location.hash = credentialString;
    }

    if (window.opener && window.opener.Package &&
          window.opener.Package.oauth) {
      window.opener.Package.oauth.OAuth._handleCredentialSecret(
        credentialToken, credentialSecret);
    } else {
      localStorage[config.storagePrefix + credentialToken] = credentialSecret;
    }
  }

  OAuthUtils.storeOAuthError(localStorage, config);
  
  if (config.error && window.opener && window.opener.Package &&
      window.opener.Package.oauth && window.opener.Package.oauth.OAuth._handleCredentialSecret) {
    OAuthUtils.storeOAuthError(window.opener.localStorage, config);
  }

  if (! config.isCordova) {
    document.getElementById("completedText").style.display = "block";
    document.getElementById("loginCompleted").onclick = function() { window.close() };
    window.close();
  }
})();

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

  if (config.error) {
    localStorage[config.storagePrefix + "error"] = config.error;
    if (config.error_description) {
      localStorage[config.storagePrefix + "error_description"] = config.error_description;
    }
    
    if (window.opener && window.opener.Package &&
        window.opener.Package.oauth && window.opener.Package.oauth.OAuth._handleCredentialSecret) {
      window.opener.localStorage[config.storagePrefix + "error"] = config.error;
      if (config.error_description) {
        window.opener.localStorage[config.storagePrefix + "error_description"] = config.error_description;
      }
    }
  }

  if (! config.isCordova) {
    document.getElementById("completedText").style.display = "block";
    document.getElementById("loginCompleted").onclick = function() { window.close() };
    window.close();
  }
})();

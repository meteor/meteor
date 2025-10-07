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
      try {
        localStorage[config.storagePrefix + credentialToken] = credentialSecret;
      } catch (err) {
        // We can't do much else, but at least close the popup instead
        // of having it hang around on a blank page.
      }
    }
  }

  if (config.error) {
    try {
      localStorage[config.storagePrefix + "error"] = config.error;
      if (config.error_description) {
        localStorage[config.storagePrefix + "error_description"] = config.error_description;
      }
      
      if (window.opener && window.opener.Package &&
          window.opener.Package.oauth && window.opener.Package.oauth.OAuth._handleCredentialSecret) {
        try {
          window.opener.localStorage[config.storagePrefix + "error"] = config.error;
          if (config.error_description) {
            window.opener.localStorage[config.storagePrefix + "error_description"] = config.error_description;
          }
        } catch (err) {
          // If we can't access opener's localStorage, the local storage above should work
        }
      }
    } catch (err) {
      // We can't do much else, but at least close the popup instead
      // of having it hang around on a blank page.
    }
  }

  if (! config.isCordova) {
    document.getElementById("completedText").style.display = "block";
    document.getElementById("loginCompleted").onclick = function() { window.close() };
    window.close();
  }
})();

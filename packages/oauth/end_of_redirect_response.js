// NOTE: This file is added to the client as asset and hence ecmascript package has no effect here.
(function() {

  var config = JSON.parse(document.getElementById("config").innerHTML);

  if (config.setCredentialToken) {
    try {
      sessionStorage[config.storagePrefix + config.credentialToken] =
        config.credentialSecret;
    } catch (err) {
      // We can't do much else, but at least the redirects goes on.
    }
  }

  window.location =
    config.redirectUrl
      ? config.redirectUrl.replace(/&amp;/g, "&")
      : config.redirectUrl;

})();

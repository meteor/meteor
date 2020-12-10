// NOTE: This file is added to the client as asset and hence ecmascript package has no effect here.
(function() {

  var config = JSON.parse(document.getElementById("config").innerHTML);

  if (config.setCredentialToken) {
    sessionStorage[config.storagePrefix + config.credentialToken] =
      config.credentialSecret;
  }

  window.location =
    config.redirectUrl
      ? config.redirectUrl.replace(/&amp;/g, "&")
      : config.redirectUrl;

})();

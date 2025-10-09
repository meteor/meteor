// NOTE: This file is added to the client as asset and hence ecmascript package has no effect here.
(function() {

  function storeOAuthError(storage, config) {
    if (config.error) {
      storage[config.storagePrefix + "error"] = config.error;
      if (config.error_description) {
        storage[config.storagePrefix + "error_description"] = config.error_description;
      }
    }
  }

  var config = JSON.parse(document.getElementById("config").innerHTML);

  if (config.setCredentialToken) {
    sessionStorage[config.storagePrefix + config.credentialToken] =
      config.credentialSecret;
  }

  storeOAuthError(localStorage, config);

  window.location =
    config.redirectUrl
      ? config.redirectUrl.replace(/&amp;/g, "&")
      : config.redirectUrl;

})();

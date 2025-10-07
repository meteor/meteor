// NOTE: This file is added to the client as asset and hence ecmascript package has no effect here.
(function() {

  var config = JSON.parse(document.getElementById("config").innerHTML);

  if (config.setCredentialToken) {
    try {
      sessionStorage[config.storagePrefix + config.credentialToken] =
        config.credentialSecret;
    } catch (err) {
      
    }
  }

  if (config.error) {
    try {
      localStorage[config.storagePrefix + "error"] = config.error;
      if (config.error_description) {
        localStorage[config.storagePrefix + "error_description"] = config.error_description;
      }
    } catch (err) {
      
    }
  }

  window.location =
    config.redirectUrl
      ? config.redirectUrl.replace(/&amp;/g, "&")
      : config.redirectUrl;

})();

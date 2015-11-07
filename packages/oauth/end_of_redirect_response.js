(function () {

  var config = JSON.parse(document.getElementById("config").innerHTML);

  if (config.setCredentialToken) {
    sessionStorage[config.storagePrefix + config.credentialToken] =
    config.credentialSecret;
  }

  window.location = config.redirectUrl;

})();

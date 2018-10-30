(() => {

  const config = JSON.parse(document.getElementById("config").innerHTML);

  if (config.setCredentialToken) {
    const { credentialToken, credentialSecret } = config;

    if (config.isCordova) {
      const credentialString = JSON.stringify({
        credentialToken,
        credentialSecret,
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

  if (! config.isCordova) {
    document.getElementById("completedText").style.display = "block";
    document.getElementById("loginCompleted").onclick = () => window.close();
    window.close();
  }
})();

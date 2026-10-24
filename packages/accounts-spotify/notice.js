if (Package['accounts-ui']
    && !Package['service-configuration']
    && !Object.prototype.hasOwnProperty.call(Package, 'spotify-config-ui')) {
  console.warn(
    "Note: You're using accounts-ui and accounts-spotify,\n" +
    "but didn't install the configuration UI for the Spotify\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add spotify-config-ui" +
    "\n"
  );
}

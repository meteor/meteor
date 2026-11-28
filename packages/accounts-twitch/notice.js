if (Package['accounts-ui']
    && !Package['service-configuration']
    && !Object.prototype.hasOwnProperty.call(Package, 'twitch-config-ui')) {
  console.warn(
    "Note: You're using accounts-ui and accounts-twitch,\n" +
    "but didn't install the configuration UI for the Twitch\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add twitch-config-ui" +
    "\n"
  );
}

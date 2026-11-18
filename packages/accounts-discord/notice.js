if (Package['accounts-ui']
    && !Package['service-configuration']
    && !Object.prototype.hasOwnProperty.call(Package, 'discord-config-ui')) {
  console.warn(
    "Note: You're using accounts-ui and accounts-discord,\n" +
    "but didn't install the configuration UI for the Discord\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add discord-config-ui" +
    "\n"
  );
}

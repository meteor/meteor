if (Package['accounts-ui']
    && !Package['service-configuration']
    && !Object.prototype.hasOwnProperty.call(Package, 'slack-config-ui')) {
  console.warn(
    "Note: You're using accounts-ui and accounts-slack,\n" +
    "but didn't install the configuration UI for the Slack\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add slack-config-ui" +
    "\n"
  );
}

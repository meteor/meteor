if (Package['accounts-ui'] && (Package['twitter-config-ui'] === undefined)) {
  console.warn(
    "Note: You're using accounts-ui and accounts-twitter,\n" +
    "but didn't install the configuration UI for Twitter\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add twitter-config-ui" +
    "\n"
  );
}

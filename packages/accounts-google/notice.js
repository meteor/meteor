if (Package['accounts-ui'] && (Package['google-config-ui'] === undefined)) {
  console.warn(
    "Note: You're using accounts-ui and accounts-google,\n" +
    "but didn't install the configuration UI for the Google\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add google-config-ui" +
    "\n"
  );
}

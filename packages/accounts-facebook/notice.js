if (Package['accounts-ui'] && (Package['facebook-config-ui'] === undefined)) {
  console.warn(
    "Note: You're using accounts-ui and accounts-facebook,\n" +
    "but didn't install the configuration UI for the Facebook\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add facebook-config-ui" +
    "\n"
  );
}

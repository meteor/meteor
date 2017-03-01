if (Package['accounts-ui']
    && !Package['service-configuration']
    && !Package.hasOwnProperty('facebook-config-ui')) {
  console.warn(
    "Note: You're using accounts-ui and accounts-facebook,\n" +
    "but didn't install the configuration UI for the Facebook\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add facebook-config-ui" +
    "\n"
  );
}

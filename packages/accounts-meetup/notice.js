if (Package['accounts-ui'] && (Package['meetup-config-ui'] === undefined)) {
  console.warn(
    "Note: You're using accounts-ui and accounts-meetup,\n" +
    "but didn't install the configuration UI for the Meetup\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add meetup-config-ui" +
    "\n"
  );
}

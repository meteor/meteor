if (Package['accounts-ui'] && (Package['github-config-ui'] === undefined)) {
  console.warn(
    "Note: You're using accounts-ui and accounts-github,\n" +
    "but didn't install the configuration UI for the GitHub\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add github-config-ui" +
    "\n"
  );
}

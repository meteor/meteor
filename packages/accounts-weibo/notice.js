if (Package['accounts-ui'] && (Package['weibo-config-ui'] === undefined)) {
  console.warn(
    "Note: You're using accounts-ui and accounts-weibo,\n" +
    "but didn't install the configuration UI for the Weibo\n" +
    "OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add weibo-config-ui" +
    "\n"
  );
}

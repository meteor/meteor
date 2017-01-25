if (Package['accounts-ui'] && (Package['twitter-config-ui'] === undefined)) {
  console.warn("Note: You're using accounts-ui and accounts-twitter, but didn't");
  console.warn("install the configuration UI for Twitter OAuth.");
  console.warn("You can install it with `meteor add twitter-config-ui`.");
}

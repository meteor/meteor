if (Package['accounts-ui'] && (Package['weibo-config-ui'] === undefined)) {
  console.warn("Note: You're using accounts-ui and accounts-weibo, but didn't");
  console.warn("install the configuration UI for Weibo OAuth.");
  console.warn("You can install it with `meteor add weibo-config-ui`.");
}

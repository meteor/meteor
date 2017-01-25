if (Package['accounts-ui'] && (Package['google-config-ui'] === undefined)) {
  console.warn("Note: You're using accounts-ui and accounts-google, but didn't");
  console.warn("install the configuration UI for Google OAuth.");
  console.warn("You can install it with `meteor add google-config-ui`.");
}

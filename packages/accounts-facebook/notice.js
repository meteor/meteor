if (Package['accounts-ui'] && (Package['facebook-config-ui'] === undefined)) {
  console.warn("Note: You're using accounts-ui and accounts-facebook, but didn't");
  console.warn("install the configuration UI for Facebook OAuth.");
  console.warn("You can install it with `meteor add facebook-config-ui`.");
}

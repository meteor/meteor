if (Package['accounts-ui'] && (Package['meetup-config-ui'] === undefined)) {
  console.warn("Note: You're using accounts-ui and accounts-meetup, ");
  console.warn("but didn't install the configuration UI for the Meetup ");
  console.warn("OAuth flow. You can install it with ");
  console.warn("`meteor add meetup-config-ui`.");
}

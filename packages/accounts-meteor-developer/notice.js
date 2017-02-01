if (Package['accounts-ui']
    && (Package['meteor-developer-config-ui'] === undefined)) {
  console.warn("Note: You're using accounts-ui and accounts-meteor-developer, ");
  console.warn("but didn't install the configuration UI for the Meteor ");
  console.warn("developer accounts OAuth. You can install it with ");
  console.warn("`meteor add meteor-developer-config-ui`.");
}

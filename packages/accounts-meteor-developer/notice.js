if (Package['accounts-ui']
    && !Package['service-configuration']
    && !Package.hasOwnProperty('meteor-developer-config-ui')) {
  console.warn(
    "Note: You're using accounts-ui and accounts-meteor-developer,\n" +
    "but didn't install the configuration UI for the Meteor Developer\n" +
    "Accounts OAuth. You can install it with:\n" +
    "\n" +
    "    meteor add meteor-developer-config-ui" +
    "\n"
  );
}

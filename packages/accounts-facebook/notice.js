if (Package['accounts-ui'] && (Package['facebook-config-ui'] === undefined)) {
    console.info("You're using accounts-ui and accounts-facebook, but didn't",
        "install the configuration UI for Facebook OAuth.");
    console.info("You can install it with `meteor add facebook-config-ui`.");
}

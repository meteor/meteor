if (Package['accounts-ui'] && (typeof Package['facebook-config-ui'] === undefined)) {
    console.info("You're using accounts-ui and accounts-facebook, but didn't",
        "install the configuration UI for Facebook OAuth. You can do it by",
        "adding facebook-config-ui.");
}

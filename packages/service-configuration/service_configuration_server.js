// Only one configuration should ever exist for each service.
// A unique index helps avoid various race conditions which could
// otherwise lead to an inconsistent database state (when there are multiple
// configurations for a single service, which configuration is correct?)
try {
    ServiceConfiguration.configurations._ensureIndex(
        { "service": 1 },
        { unique: true }
    );
} catch (err) {
    console.error(
        "The service-configuration package persists configuration in the " +
        "meteor_accounts_loginServiceConfiguration collection in MongoDB. As " +
        "each service should have exactly one configuration, Meteor " +
        "automatically creates a MongoDB index with a unique constraint on the " +
        " meteor_accounts_loginServiceConfiguration collection. The " +
        "_ensureIndex command which creates that index is failing.\n\n" +
        "Meteor versions before 1.0.4 did not create this index. If you recently " +
        "upgraded and are seeing this error message for the first time, please " +
        "check your meteor_accounts_loginServiceConfiguration collection for " +
        "multiple configuration entries for the same service and delete " +
        "configuration entries until there is no more than one configuration " +
        "entry per service.\n\n" +
        "If the meteor_accounts_loginServiceConfiguration collection looks " +
        "fine, the _ensureIndex command is failing for some other reason.\n\n" +
        "For more information on this history of this issue, please see " +
        "https://github.com/meteor/meteor/pull/3514.\n"
    );
    throw err;
}

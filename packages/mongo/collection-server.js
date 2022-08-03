if (Meteor.isServer) {
    const userOptions = Meteor.settings?.packages?.mongo || {};
    if (!userOptions?.skipStartupConnection && !process.env.METEOR_TEST_FAKE_MONGOD_CONTROL_PORT) {
        await MongoInternals.defaultRemoteCollectionDriver();
    }
}

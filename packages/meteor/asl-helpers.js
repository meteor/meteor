const getAslStore = () => {
    if (Meteor.isServer && global.asyncLocalStorage) {
        return global.asyncLocalStorage.getStore();
    }

    return {};
};
const getValueFromAslStore = key => getAslStore()[key];
const updateAslStore = (key, value) => getAslStore()[key] = value;

Meteor._isFibersEnabled = !process.env.DISABLE_FIBERS && Meteor.isServer;
Meteor._getAslStore = getAslStore;
Meteor._getValueFromAslStore = getValueFromAslStore;
Meteor._updateAslStore = updateAslStore;

Meteor._runAsync = (fn, ctx) => {
    if (Meteor._isFibersEnabled) {
        const Fiber = Npm.require('fibers');

        return Fiber(() => {
            fn.call(ctx);
        }).run();
    }

    global.asyncLocalStorage.run(Meteor._getAslStore(), () => {
        fn.call(ctx);
    });
};

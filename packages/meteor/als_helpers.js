// In Meteor versions with fibers, __meteor_bootstrap__.isFibersDisabled
// is always undefined.
Meteor.isFibersDisabled = typeof __meteor_bootstrap__ === 'object' &&
  __meteor_bootstrap__.isFibersDisabled !== undefined;
Meteor._isFibersEnabled = !Meteor.isFibersDisabled;

function getAls() {
  /**
   * lazily create __METEOR_ASYNC_LOCAL_STORAGE since this might run in older Meteor
   * versions that are incompatible with async hooks
   */
  if (!global.__METEOR_ASYNC_LOCAL_STORAGE) {

    const { AsyncLocalStorage } = Npm.require('async_hooks');

    global.__METEOR_ASYNC_LOCAL_STORAGE = new AsyncLocalStorage();

    __METEOR_ASYNC_LOCAL_STORAGE.name = 'Meteor.AsyncLocalStorage';
  }

  return global.__METEOR_ASYNC_LOCAL_STORAGE;
}

function getAlsStore() {
  if (!Meteor.isServer) {
    return {};
  }

  const als = getAls();

  return als.getStore() || {};
}

function getValueFromAslStore(key) {
  return getAlsStore()[key];
}

function updateAslStore(key, value) {
  return getAlsStore()[key] = value;
}

function runFresh(fn) {
  const als = getAls();
  return als.run({}, fn);
}

Meteor._getAls = getAls;
Meteor._getAlsStore = getAlsStore;
Meteor._getValueFromAlsStore = getValueFromAslStore;
Meteor._updateAlsStore = updateAslStore;
Meteor._runFresh = runFresh;

Meteor._runAsync = function (fn, ctx, store) {
  const als = getAls();

  return als.run(
    store || Meteor._getAlsStore(),
    fn.bind(ctx)
  );
};

Meteor._isPromise = function (r) {
  return r && typeof r.then === 'function';
};

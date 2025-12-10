// In Meteor versions with fibers, __meteor_bootstrap__.isFibersDisabled
// is always undefined.
Meteor.isFibersDisabled = typeof __meteor_bootstrap__ === 'object' &&
  __meteor_bootstrap__.isFibersDisabled !== undefined;
Meteor._isFibersEnabled = !Meteor.isFibersDisabled;

function getAsl() {
  if (!Meteor.isFibersDisabled) {
    throw new Error('Can not use async hooks when fibers are enabled');
  }

  if (!global.__METEOR_ASYNC_LOCAL_STORAGE) {
    // lazily create __METEOR_ASYNC_LOCAL_STORAGE since this might run in older Meteor
    // versions that are incompatible with async hooks
    var AsyncLocalStorage = Npm.require('async_hooks').AsyncLocalStorage;
    global.__METEOR_ASYNC_LOCAL_STORAGE = new AsyncLocalStorage();
  }

  return global.__METEOR_ASYNC_LOCAL_STORAGE;
}

function getAslStore() {
  if (!Meteor.isServer) {
    return {};
  }

  var als = getAsl();
  return als.getStore() || {};
}

function getValueFromAslStore(key) {
  return getAslStore()[key];
}

function updateAslStore(key, value) {
  return getAslStore()[key] = value;
}

function runFresh(fn) {
  var als = getAsl();
  return als.exit(fn);
}

Meteor._getAsl = getAsl;
Meteor._getAslStore = getAslStore;
Meteor._getValueFromAslStore = getValueFromAslStore;
Meteor._updateAslStore = updateAslStore;
Meteor._runFresh = runFresh;

Meteor._runAsync = function (fn, ctx, store) {
  if (store === undefined) {
    store = {};
  }
  var als = getAsl();

  return als.run(
    store || Meteor._getAslStore(),
    function () {
      return fn.call(ctx);
    }
  );
};

Meteor._isPromise = function (r) {
  return r && typeof r.then === 'function';
};

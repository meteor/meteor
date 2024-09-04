const makeUnique = (arr) => [...new Set(arr)];

const makeModules = (names) => {
  const modules = [];
  // check for modules (names with no dots or hashes)
  for (const name of names) {
    if (name.includes("#")) continue;
    if (name.includes(".")) continue;
    modules.push(name);
  }
  return modules;
};

const makeApiList = (modules) => {
  let currentModule = modules[0];
  const apiList = {};
  for (const name of modules) {
    if (!apiList[currentModule]) {
      apiList[currentModule] = {
        [currentModule]: [],
      };
    }
    if (name.includes(currentModule)) {
      apiList[currentModule][name] = [];
      continue;
    }
    currentModule = name;
  }
  return apiList;
};

/**
 *
 * @param {Array<string} names
 * @returns {Object<string, Object<string, Array<string>>}
 */
export function createMap(names) {
  /**
   * @type {string[]}
   */
  const modules = makeModules(names);

  /**
   * @type {Object<string, Object<string, Array<string>>}
   */
  const apiList = makeApiList(modules);

  const MODULES_TO_ADD = {
    module: { module: [] },
    Session: { Session: [] },
    Random: { Random: [] },
    Email: { Email: [] },
    DDPRateLimiter: { DDPRateLimiter: [] },
  };

  Object.assign(apiList, MODULES_TO_ADD);

  // populating map with links
  for (const api of Object.keys(apiList)) {
    const links = apiList[api];
    for (const link of Object.keys(links)) {
      const allApis = names.filter(
        (name) => name.includes(link + ".") || name.includes(link + "#")
      );
      apiList[api][link] = makeUnique(allApis);
    }
  }

  // break App and WebApp

  const webApp = apiList.App.App.filter((name) => name.includes("WebApp"));
  const app = apiList.App.App.filter((name) => !name.includes("WebApp"));

  apiList.App.App = app;
  apiList.WebApp = {
    WebApp: webApp,
  };

  // delete missplaced apis
  const TO_IGNORE = [
    "addRuntimeConfigHookCallback(options)",
    "addUpdatedNotifyHookCallback(options)",
    "currentUser",
    "expressHandlersCallback(req, res, next)",
    "getPublicationStrategy",
    "loggingIn",
    "main",
    "loggingOut",
    "IterationCallback",
    "CompileStep",
    "Cordova",
    "Plugin"
  ];


  for (const key of Object.keys(apiList))
    if (TO_IGNORE.includes(key)) delete apiList[key];

  // reroute DDP to -> meteor.html#DDP-connect
  apiList.DDP.shouldGoTo = '/api/meteor';
  // Match -> check#Match
  apiList.check.shouldGoTo = '/api/check';
  // Mongo -> collections.html#Mongo
  apiList.Mongo.shouldGoTo = '/api/collections';
  // Npm -> package.html#Npm
  apiList.Npm.shouldGoTo = '/api/package';
  // Subscription -> meteor.html#Meteor-publish
  apiList.Subscription.shouldGoTo = '/api/meteor';
  // Module -> packages/hot-module-replacement.html
  apiList.module.shouldGoTo = '/packages/hot-module-replacement';
  // Random -> packages/random.html
  apiList.Random.shouldGoTo = '/packages/random';
  // WebApp -> packages/webapp.html
  apiList.WebApp.shouldGoTo = '/packages/webapp';
  return apiList;
}

/**
 *
 * @param {string} filter
 * @returns {Object<string, Object<string, Array<string>>}
 * @returns {Object<string, Object<string, Array<string>>}
 */
export function filterMap(filter, apiList) {
  if (filter === "") {
    return apiList;
  }
  const newList = {};
  for (const api in apiList) {
    const newLinks = {};
    for (const key in apiList[api]) {
      const links = apiList[api][key];
      // We get the shouldGoTo link here as well.
      // In this case we just skip it
      if (!Array.isArray(links)) {
        continue;
      }
      const newLinksArray = links.filter((link) => {
        return link.toLowerCase().includes(filter.toLowerCase());
      });
      if (newLinksArray.length > 0) {
        newLinks[key] = newLinksArray;
      }
    }
    if (Object.keys(newLinks).length > 0) {
      newList[api] = newLinks;
    }
  }
  return newList;
}

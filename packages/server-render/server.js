import { Meteor } from "meteor/meteor";
import "./server-register.js";

const startupPromise = new Promise(Meteor.startup);
const pageLoadCallbacks = new Set;

export function onPageLoad(callback) {
  if (typeof callback === "function") {
    pageLoadCallbacks.add(callback);
  }

  // Return the callback so that it can be more easily removed later.
  return callback;
}

onPageLoad.remove = function (callback) {
  pageLoadCallbacks.delete(callback);
};

onPageLoad.clear = function () {
  pageLoadCallbacks.clear();
};

onPageLoad.chain = function (handler) {
  return startupPromise.then(() => {
    let promise = Promise.resolve();
    pageLoadCallbacks.forEach(callback => {
      promise = promise.then(() => handler(callback));
    });
    return promise;
  });
};

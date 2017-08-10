// Meteor._localStorage is not an ideal name, but we can change it later.

// Let's test to make sure that localStorage actually works. For example, in
// Safari with private browsing on, window.localStorage exists but actually
// trying to use it throws.
// Accessing window.localStorage can also immediately throw an error in IE (#1291).

var hasOwn = Object.prototype.hasOwnProperty;
var key = '_localstorage_test_' + Random.id();
var retrieved;
var storage;

try {
  storage = global.localStorage;

  if (storage) {
    storage.setItem(key, key);
    retrieved = storage.getItem(key);
    storage.removeItem(key);
  }
} catch (ignored) {}

if (key === retrieved) {
  if (Meteor.isServer) {
    Meteor._localStorage = storage;
  } else {
    // Some browsers (e.g. IE11) don't properly handle attempts to change
    // window.localStorage methods. By using proxy methods to expose
    // window.localStorage functionality, developers can change the
    // behavior of Meteor._localStorage methods without breaking
    // window.localStorage.
    ["getItem",
     "setItem",
     "removeItem",
    ].forEach(function (name) {
      this[name] = function () {
        return storage[name].apply(storage, arguments);
      };
    }, Meteor._localStorage = {});
  }
}

if (! Meteor._localStorage) {
  if (Meteor.isClient) {
    Meteor._debug(
      "You are running a browser with no localStorage or userData "
        + "support. Logging in from one tab will not cause another "
        + "tab to be logged in.");
  }

  Meteor._localStorage = Object.create({
    setItem: function (key, val) {
      this[key] = val;
    },

    removeItem: function (key) {
      delete this[key];
    },

    getItem: function (key) {
      return hasOwn.call(this, key) ? this[key] : null;
    }
  });
}

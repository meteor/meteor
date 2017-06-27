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
    // IE11 doesn't handle properly attempts to change methods of the
    // window.localStorage, attempts to do so will result in the complete
    // break of the localStorage system for the domain in which it is
    // done - until the user clean the browser/domain cache.
    //
    // Therefore, in the web, we don't set Meteor._localStorage to be a
    // reference to window.localStorage . Instead, we set proxy methods.
    //
    // This will allow package developers that will find a need to change
    // the behavior of Meteor._localStorage methods to do so without breaking
    // the localStorage system on IE11. (e.g. meteorhacks:fast-render)

    Meteor._localStorage = {
      getItem: function (key) {
        return window.localStorage.getItem(key);
      },
      setItem: function (key, value) {
        window.localStorage.setItem(key, value);
      },
      removeItem: function (key) {
        window.localStorage.removeItem(key);
      }
    };
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

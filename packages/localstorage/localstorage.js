// Meteor._localStorage is not an ideal name, but we can change it later.

// Let's test to make sure that localStorage actually works. For example, in
// Safari with private browsing on, window.localStorage exists but actually
// trying to use it throws.
// Accessing window.localStorage can also immediately throw an error in IE (#1291).

var key = '_localstorage_test_' + Random.id();
var retrieved;
// Capture the first argument in the current URL to prevent localstorage 
// collisions for multiple Meteor applications running on the same domain.
var path = window.location.pathname.replace(/^\/([^\/]*).*$/, '$1') + '.';
try {
  if (window.localStorage) {
    window.localStorage.setItem(key, key);
    retrieved = window.localStorage.getItem(key);
    window.localStorage.removeItem(key);
  }
} catch (e) {
  // ... ignore
}
if (key === retrieved) {
  Meteor._localStorage = {
    getItem: function (key) {
      // Fetch the data the current application set by using the path variable.
      return window.localStorage.getItem(path + key);
    },
    setItem: function (key, value) {
      // Save the value using the path variable to avoid overwriting data
      // stored by other applications running on the same domain.
      window.localStorage.setItem(path + key, value);
    },
    removeItem: function (key) {
      // Delete the value the current application set using the path variable.
      window.localStorage.removeItem(path + key);
    }
  };
}

if (!Meteor._localStorage) {
  Meteor._debug(
    "You are running a browser with no localStorage or userData "
      + "support. Logging in from one tab will not cause another "
      + "tab to be logged in.");

  Meteor._localStorage = {
    _data: {},

    setItem: function (key, val) {
      this._data[key] = val;
    },
    removeItem: function (key) {
      delete this._data[key];
    },
    getItem: function (key) {
      var value = this._data[key];
      if (value === undefined)
        return null;
      else
        return value;
    }
  };
}

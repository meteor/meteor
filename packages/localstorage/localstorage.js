// Meteor._localStorage is not an ideal name, but we can change it later.

if (window.localStorage) {
  // Let's test to make sure that localStorage actually works. For example, in
  // Safari with private browsing on, window.localStorage exists but actually
  // trying to use it throws.

  var key = '_localstorage_test_' + Random.id();
  var retrieved;
  try {
    window.localStorage.setItem(key, key);
    retrieved = window.localStorage.getItem(key);
    window.localStorage.removeItem(key);
  } catch (e) {
    // ... ignore
  }
  if (key === retrieved) {
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

// XXX eliminate dependency on jQuery, detect browsers ourselves
// Else, if we are on IE, which support userData
if (!Meteor._localStorage && $.browser.msie) {
  var userdata = document.createElement('span'); // could be anything
  userdata.style.behavior = 'url("#default#userData")';
  userdata.id = 'localstorage-helper';
  userdata.style.display = 'none';
  document.getElementsByTagName("head")[0].appendChild(userdata);

  var userdataKey = 'localStorage';
  userdata.load(userdataKey);

  Meteor._localStorage = {
    setItem: function (key, val) {
      userdata.setAttribute(key, val);
      userdata.save(userdataKey);
    },

    removeItem: function (key) {
      userdata.removeAttribute(key);
      userdata.save(userdataKey);
    },

    getItem: function (key) {
      userdata.load(userdataKey);
      return userdata.getAttribute(key);
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

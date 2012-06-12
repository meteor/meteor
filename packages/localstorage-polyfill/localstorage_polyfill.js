Meteor.startup(function() { // Since we need document.body to be defined
  if (!window.localStorage) {
    window.localStorage = (function () {
      if ($.browser.msie) { // If we are on IE, which support userData
        var userdata = document.createElement('span'); // could be anything
        userdata.style.behavior = 'url("#default#userData")';
        userdata.id = 'localstorage-polyfill-helper';
        userdata.style.display = 'none';
        document.body.appendChild(userdata);

        var userdataKey = 'localStorage';
        userdata.load(userdataKey);

        return {
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
      } else {
        Meteor._debug(
          "You are running a browser with no localStorage or userData "
            + "support (presumable Opera Mini). Logging in from one tab "
            + "will not cause another tab to be logged in.");

        return {
          setItem: function () {},
          removeItem: function () {},
          getItem: function () {}
        };
      };
    })();
  }
});

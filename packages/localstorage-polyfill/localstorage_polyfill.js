Meteor.startup(function() { // Since we need document.body to be defined
  if (!window.localStorage) {
    window.localStorage = (function () {
      var userdata = document.createElement('span'); // could be anything

      if (userdata.load) { // If we are on IE, which support userData
        userdata.id = 'localstorage-polyfill-helper';
        userdata.style.display = 'none';
        userdata.style.behavior = 'url("#default#userData")';
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
            return userdata.getAttribute(key);
          }
        };
      } else {
        return {
          setItem: function() {},
          removeItem: function() {},
          getItem: function() {}
        };
      };
    })();
  }
});

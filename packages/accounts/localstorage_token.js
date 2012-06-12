// Tries to log in using a meteor token stored in local storage
Meteor.loginFromLocalStorage = function () {
  var loginToken = localStorage.getItem("Meteor.loginToken");
  if (loginToken) {
    Meteor.apply('login', [{resume: loginToken}], {wait: true}, function(error, result) {
      if (error) {
        Meteor._debug("Server error on login", error);
        return;
      }

      Meteor.default_connection.setUserId(result.id);
      Meteor.default_connection.onReconnect = function() {
        Meteor.apply('login', [{resume: loginToken}], {wait: true}, function(error, result) {
          if (error) {
            Meteor.default_connection.setUserId(null);
            localStorage.setItem("Meteor.loginToken", "");
            Meteor._debug("Server error on login", error);
            return;
          }
        });
      };
    });
  }
};

// Immediately try to log in via local storage, so that any DDP
// messages are sent after we have established our user account
Meteor.loginFromLocalStorage();

// Poll local storage every 3 seconds to login if someone logged in in
// another tab
Meteor._lastLoginTokenWhenPolled = localStorage.getItem("Meteor.loginToken");
setInterval(function() {
  var currentLoginToken = localStorage.getItem("Meteor.loginToken");
  if (Meteor._lastLoginTokenWhenPolled !== currentLoginToken) {
    if (currentLoginToken)
      Meteor.loginFromLocalStorage();
    else
      Meteor.logout();
  }
  Meteor._lastLoginTokenWhenPolled = localStorage.getItem("Meteor.loginToken");
}, 3000);


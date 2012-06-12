Meteor.user = function () {
  if (Meteor.default_connection.userId()) {
    // XXX full identity?
    return {_id: Meteor.default_connection.userId()};
  } else {
    return null;
  }
};

if (Handlebars) {
  Handlebars.registerHelper('user', function () {
    return Meteor.user();
  });
}

Meteor.loginWithFacebook = function (callback) {
  var openCenteredPopup = function(url, width, height) {
    var screenX = typeof window.screenX !== 'undefined'
          ? window.screenX : window.screenLeft;
    var screenY = typeof window.screenY !== 'undefined'
          ? window.screenY : window.screenTop;
    var outerWidth = typeof window.outerWidth !== 'undefined'
          ? window.outerWidth : document.body.clientWidth;
    var outerHeight = typeof window.outerHeight !== 'undefined'
          ? window.outerHeight : (document.body.clientHeight - 22);

    // Use `outerWidth - width` and `outerHeight - height` for help in
    // positioning the popup centered relative to the current window
    var left = screenX + (outerWidth - width) / 2;
    var top = screenY + (outerHeight - height) / 2;
    var features = ('width=' + width + ',height=' + height +
                    ',left=' + left + ',top=' + top);

    var newwindow = window.open(url, 'Login', features);
    if (newwindow.focus)
      newwindow.focus();
    return newwindow;
  };

  if (!Meteor.accounts.facebook._appId || !Meteor.accounts.facebook._appUrl)
    throw new Meteor.accounts.facebook.SetupError("Need to call Meteor.accounts.facebook.setup first");

  var oauthState = Meteor.uuid();

  var popup = openCenteredPopup(
    'https://www.facebook.com/dialog/oauth?client_id=' + Meteor.accounts.facebook._appId +
      '&redirect_uri=' + Meteor.accounts.facebook._appUrl + '/_oauth/facebook' +
      '&scope=email&state=' + oauthState,
    1000, 600); // XXX should we use different dimensions, e.g. on mobile?

  var checkPopupOpen = setInterval(function() {
    if (popup.closed) {
      clearInterval(checkPopupOpen);

      // Hit our OAuth endpoint to cancel this login request so that
      // the app doesn't hang
      Meteor.http.get(Meteor.accounts.facebook._appUrl +
                      '/_oauth/facebook/?error=error&state=' + oauthState,
                      function() {});
    }
  }, 1000);

  Meteor.apply('login', [
    {oauth: {version: 2, provider: 'facebook', state: oauthState}}
  ], {wait: true}, function(error, result) {
    if (error) {
      Meteor._debug("Server error on login", error);
      return;
    }

    localStorage.setItem("Meteor.loginToken", result.token);
    Meteor.default_connection.setUserId(result.id);
    Meteor.default_connection.onReconnect = function() {
      Meteor.apply('login', [{resume: result.token}], {wait: true}, function(error, result) {
        if (error) {
          Meteor.default_connection.setUserId(null);
          localStorage.setItem("Meteor.loginToken", "");
          Meteor._debug("Server error on login", error);
          return;
        }
      });
    };
    if (typeof callback === 'function')
      callback();
  });
};

Meteor.logout = function () {
  Meteor.apply('logout', [], {wait: true}, function(error, result) {
    if (error) {
      Meteor._debug("Server error on logout", error);
      return;
    }

    localStorage.setItem("Meteor.loginToken", "");
    Meteor.default_connection.setUserId(null);
    Meteor.default_connection.onReconnect = null;
  });
};

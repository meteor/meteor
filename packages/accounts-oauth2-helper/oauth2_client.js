(function () {
  // Open a popup window pointing to a OAuth handshake page
  //
  // @param state {String} The OAuth state generated by the client
  // @param url {String} url to page
  // @param options {Object} popup configuration options
  Meteor.accounts.oauth2.initiateLogin = function(state, url, options) {

    options || (options = {});
    options.features = _.extend(defaultPopup.features, options.features);

    var popup = openCenteredPopup(url, options);

    var checkPopupOpen = setInterval(function() {
      if (popup.closed) {
        clearInterval(checkPopupOpen);
        tryLoginAfterPopupClosed(state);
      }
    }, 100);
  };

  // Send an OAuth login method to the server. If the user authorized
  // access in the popup this should log the user in, otherwise
  // nothing should happen.
  var tryLoginAfterPopupClosed = function(state) {
    Meteor.apply('login', [
      {oauth: {version: 2, state: state}}
    ], {wait: true}, function(error, result) {
      if (error)
        throw error;

      if (!result) {
        // The user either closed the OAuth popup or didn't authorize
        // access.  Do nothing.
        return;
      } else {
        Meteor.accounts.makeClientLoggedIn(result.id, result.token);
      }
    });
  };

  var defaultPopup = {
    features: {
      width: 650,
      height: 331
    }
  };

  var openCenteredPopup = function(url, options) {
    var features = options.features;

    var screenX = typeof window.screenX !== 'undefined'
          ? window.screenX : window.screenLeft;
    var screenY = typeof window.screenY !== 'undefined'
          ? window.screenY : window.screenTop;
    var outerWidth = typeof window.outerWidth !== 'undefined'
          ? window.outerWidth : document.body.clientWidth;
    var outerHeight = typeof window.outerHeight !== 'undefined'
          ? window.outerHeight : (document.body.clientHeight - 22);
    var left = screenX + (outerWidth - features.width) / 2;
    var top = screenY + (outerHeight - features.height) / 2;

    // Use `outerWidth - width` and `outerHeight - height` for help in
    // positioning the popup centered relative to the current window
    features.left = left;
    features.top = top;

    var featuresString = _.map(features, function(val, key) {
      return key + '=' + val;
    }).join(',');

    var newwindow = window.open(url, 'Login', featuresString);
    if (newwindow.focus)
      newwindow.focus();
    return newwindow;
  };
})();
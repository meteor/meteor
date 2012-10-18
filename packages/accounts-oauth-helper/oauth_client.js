(function () {
  // Open a popup window pointing to a OAuth handshake page
  //
  // @param state {String} The OAuth state generated by the client
  // @param url {String} url to page
  // @param callback {Function} Callback function to call on
  //   completion. Takes one argument, null on success, or Error on
  //   error.
  // @param dimensions {optional Object(width, height)} The dimensions of
  //   the popup. If not passed defaults to something sane
  Accounts.oauth.initiateLogin = function(state, url, callback, dimensions) {
    // XXX these dimensions worked well for facebook and google, but
    // it's sort of weird to have these here. Maybe an optional
    // argument instead?
    var popup = openCenteredPopup(
      url,
      (dimensions && dimensions.width) || 650,
      (dimensions && dimensions.height) || 331);

    var checkPopupOpen = setInterval(function() {
      // Fix for #328 - added a second test criteria (popup.closed === undefined)
      // to humour this Android quirk:
      // http://code.google.com/p/android/issues/detail?id=21061
      if (popup.closed || popup.closed === undefined) {
        clearInterval(checkPopupOpen);
        tryLoginAfterPopupClosed(state, callback);
      }
    }, 100);
  };

  // Send an OAuth login method to the server. If the user authorized
  // access in the popup this should log the user in, otherwise
  // nothing should happen.
  var tryLoginAfterPopupClosed = function(state, callback) {
    Meteor.apply('login', [
      {oauth: {state: state}}
    ], {wait: true}, function(error, result) {
      if (error) {
        // got an error from the server. report it back.
        callback && callback(error);
      } else if (!result) {
        // got an empty response from the server. This means our oauth
        // state wasn't recognized, which could be either because the
        // popup was closed by the user before completion, or some sort
        // of error where the oauth provider didn't talk to our server
        // correctly and closed the popup somehow.
        //
        // we assume it was user canceled, and report it as such. this
        // will mask failures where things are misconfigured such that
        // the server doesn't see the request but does close the
        // window. This seems unlikely.
        callback &&
          callback(new Accounts.LoginCancelledError("Popup closed"));
      } else {
        Accounts._makeClientLoggedIn(result.id, result.token);
        callback && callback();
      }
    });
  };

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
})();

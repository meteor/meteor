// Browser specific code for the OAuth package.

// Open a popup window, centered on the screen, and call a callback when it
// closes.
//
// @param url {String} url to show
// @param callback {Function} Callback function to call on completion. Takes no
//   arguments.
// @param dimensions {optional Object(width, height)} The dimensions of
//   the popup. If not passed defaults to something sane.
OAuth.showPopup = (url, callback, dimensions) => {
  // default dimensions that worked well for facebook and google
  const popup = openCenteredPopup(
    url,
    (dimensions && dimensions.width) || 650,
    (dimensions && dimensions.height) || 331
  );

  const checkPopupOpen = setInterval(() => {
    let popupClosed;
    try {
      // Fix for #328 - added a second test criteria (popup.closed === undefined)
      // to humour this Android quirk:
      // http://code.google.com/p/android/issues/detail?id=21061
      popupClosed = popup.closed || popup.closed === undefined;
    } catch (e) {
      // For some unknown reason, IE9 (and others?) sometimes (when
      // the popup closes too quickly?) throws "SCRIPT16386: No such
      // interface supported" when trying to read 'popup.closed'. Try
      // again in 100ms.
      return;
    }

    if (popupClosed) {
      clearInterval(checkPopupOpen);
      callback();
    }
  }, 100);
};

// Login popups must never share a window name. `window.open` re-targets an
// existing window when the name matches, so a constant name (this used to be
// 'Login') breaks nested OAuth flows: when the login service is itself a
// Meteor app — e.g. logging into Meteor developer accounts, which then logs in
// via GitHub — the service's own `window.open(url, 'Login', ...)` matches the
// popup we already opened and navigates THAT window to the inner provider
// instead of opening a new one. Both login attempts then fail with no error.
// The counter keeps names unique within this document; the timestamp and
// random suffix keep them unique across documents, since the app and the login
// service each run their own copy of this code. See issue #12418.
let popupSequence = 0;

const uniqueLoginWindowName = () =>
  `Login_${Date.now()}_${Math.floor(Math.random() * 1e9)}_${++popupSequence}`;

const openCenteredPopup = function(url, width, height) {
  const screenX = typeof window.screenX !== 'undefined'
        ? window.screenX : window.screenLeft;
  const screenY = typeof window.screenY !== 'undefined'
        ? window.screenY : window.screenTop;
  const outerWidth = typeof window.outerWidth !== 'undefined'
        ? window.outerWidth : document.body.clientWidth;
  const outerHeight = typeof window.outerHeight !== 'undefined'
        ? window.outerHeight : (document.body.clientHeight - 22);
  // XXX what is the 22?

  // Use `outerWidth - width` and `outerHeight - height` for help in
  // positioning the popup centered relative to the current window
  const left = screenX + (outerWidth - width) / 2;
  const top = screenY + (outerHeight - height) / 2;
  const features = (`width=${width},height=${height}` +
                  `,left=${left},top=${top},scrollbars=yes`);

  const newwindow = window.open(url, uniqueLoginWindowName(), features);

  if (!newwindow || newwindow.closed) {
    // blocked by a popup blocker maybe?
    const err = new Error("The login popup was blocked by the browser");
    err.attemptedUrl = url;
    throw err;
  }

  if (newwindow.focus)
    newwindow.focus();
  
  return newwindow;
};

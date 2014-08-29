// Cordova specific code for the OAuth package.

// Open a popup window, centered on the screen, and call a callback when it
// closes.
//
// @param url {String} url to show
// @param callback {Function} Callback function to call on completion. Takes no
//   arguments.
// @param dimensions {optional Object(width, height)} The dimensions of
//   the popup. If not passed defaults to something sane.
OAuth.showPopup = function (url, callback, dimensions) {
  console.log("showing url", url);
  var popup = window.open(url, '_blank', 'location=yes,hidden=yes');
  popup.addEventListener('loadstart', pageStartLoad);
  popup.addEventListener('loadstop', pageLoaded);
  popup.addEventListener('loaderror', fail);
  popup.addEventListener('exit', close);
  popup.show();

  function pageStartLoad (event) {
    console.log("page start load", JSON.stringify(event));
  }
  function fail (err) {
    Meteor._debug(err);
  }

  function close () {
    console.log("close");
  }
  function pageLoaded (event) {
    console.log("loaded", event.url);
    console.log("comparing to", Meteor.absoluteUrl('_oauth'));
    var url = decodeURI(event.url);
    console.log("decoded", url);
    if (url.indexOf(Meteor.absoluteUrl('_oauth')) === 0) {
      var credentials = JSON.parse(url.split('#')[1]);
      OAuth._handleCredentialSecret(credentials.credentialToken,
        credentials.credentialSecret);

      popup.close();
      callback();
    }
  }
};
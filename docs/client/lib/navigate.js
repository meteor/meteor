navigate = function (hash) {
  var secure = false;
  if (/^https:/.test(window.location.href)) {
    secure = true;
  }
  window.location.replace(Meteor.absoluteUrl(null, { secure: secure }) + hash);
};

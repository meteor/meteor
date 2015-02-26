navigate = function (hash) {
  window.location.replace(Meteor.absoluteUrl(null, { secure: true }) + hash);
};

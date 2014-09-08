// make links backwards compatible - for example, #deps -> #tracker

Meteor.startup(function () {
  var getRedirect = function (hash) {
    if (hash.indexOf("deps") !== -1) {
      return hash.replace("deps", "tracker");
    }

    if (hash === "meteor_collection") {
      return "mongo_collection";
    }

    if (hash === "collection_object_id") {
      return "mongo_object_id";
    }

    if (hash === "match") {
      return "check_package";
    }

    if (hash === "meteorbundle") {
      return "meteorbuild";
    }

    // don't redirect
    return false;
  };

  var curLink = window.location.hash.slice(1);
  var redirect = getRedirect(curLink);

  if (redirect) {
    window.location = "#" + redirect;
  }
});

// make links backwards compatible - for example, #deps -> #tracker

var getRedirect = function (hash) {
  if (hash.indexOf("deps") !== -1) {
    return hash.replace("deps", "tracker");
  }

  // don't redirect
  return false;
};

var curLink = window.location.hash.slice(1);
var redirect = getRedirect(curLink);

if (redirect) {
  window.location = "#" + redirect;
}
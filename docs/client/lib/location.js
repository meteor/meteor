Location = {};

var dep = new Deps.Dependency;

// Returns the path, query string if any, and hash if any (not the hostname).
// Always begins with '/'.
Location.get = function () {
  dep.depend();
  return window.location.pathname + window.location.search +
    window.location.hash;
};

Location.getParts = function () {
  dep.depend();
  return {
    path: window.location.pathname,
    query: window.location.search || undefined,
    fragment: window.location.hash || undefined
  };
};

// 'path' can be a relative or absolute path and may include a hash
Location.set = function (path) {
  if (! history.pushState) {
    // Old browser. Take a page reload.
    window.location = path;
    return;
  }

  history.pushState({}, '', path);
  dep.changed(); // pushState doesn't fire popstate

  // XXX send mixpanel event
  // mixpanel.track('docs_navigate_' + sel);
};

addEventListener('popstate', function () {
  dep.changed();
});

// Turn clicks on links into pushstate calls.
// XXX no good if not deployed at root!
$('html').delegate('a', 'click', function (evt) {
  if (! history.pushState)
    // No pushstate support. Don't meddle.
    return;

  var href = $(this).attr('href');
  if (! href)
    return;

  // If it points at another host, don't touch it
  if (href.match(/^([a-zA-Z0-9+-.]+:)?\/\//))
    return;

  // Intercept it and turn it into a pushState
  evt.preventDefault();
  Location.set(href);
});





// An experimental, avant garde view of routing. Routes don't cause
// templates to render. Instead they set reactive variables that you
// can read with Page.get().

// Depends on: Location, ReactiveDict

Page = {};
var dict = new ReactiveDict;
var currentKeys = [];

var routes = {}; // name to Route
var Route = function (name, pattern) {
  if (pattern.charAt(0) !== '/')
    throw new Error("URL pattern must start with '/'");

  this.name = name;
  this.pathParts = [];
  this.hashPart = null;

  if (pattern === '/')
    return;

  // XXX iron-router's scheme (compiling into a regexp) is much
  // better, and supports globs more naturally
  while (pattern.length) {
    var match = pattern.match(/^([?#\/])(:?)([^?#\/]+)(.*)/);
    if (! match)
      throw new Error("pattern parse error?");
    if (match[1] === '?')
      throw new Error("Query string patterns not supported");
    if (this.hashPart)
      throw new Error("Fragment pattern, if any, must be last");
    if (match[2] === ":")
      var part = { name: match[3] };
    else
      var part = match[3];
    if (match[1] === '/')
      this.pathParts.push(part);
    else
      this.hashPart = part;
    pattern = match[4];
  }
};

_.extend(Route.prototype, {
  // pieces: path, query, fragment
  // returns null (no match) or params object
  matches: function (pieces) {
    var self = this;
    var params = { name: self.name };
    var matches = true;

    var match = function (value, part) {
      if (part === undefined)
        return;
      if (value === undefined)
        matches = false;
      else if (typeof part === "string")
        matches = matches && (value === part);
      else
        params[part.name] = value || '';
    };

    if (pieces.path.charAt(0) !== '/')
      throw new Error("path doesn't start with '/'?");
    var pathValues = pieces.path.split('/').slice(1);
    if (pathValues.length && pathValues[pathValues.length - 1].length === 0)
      pathValues.pop(); // trailing '/'
    if (pathValues.length !== self.pathParts.length)
      return null;
    for (var i = 0; i < self.pathParts.length; i++)
      match(decodeURIComponent(pathValues[i]), self.pathParts[i]);

    // hash part is ignored if present and not required
    // XXX this should happen only if it's marked optional? otherwise
    // if you have one route with a fragment and one without, confusion
    // XXX HACK now it's also optional (can be omitted even if present in pattern)
    if (self.hashPart && pieces.fragment)
      match(pieces.fragment.slice(1), self.hashPart);

    return matches ? params : null;
  },

  url: function (params) {
    var self = this;

    var ret = '';
    var addPart = function (prefix, part, optional) {
      if (typeof part === 'string')
        ret += prefix + encodeURIComponent(part);
      if (! _.has(params, part.name) || params[part.name] === undefined) {
        if (optional)
          return;
        else
          throw new Error("Required URL parameter '" + part.name + "' missing");
      }
      ret += prefix + encodeURIComponent(params[part.name]);
    };

    _.each(self.pathParts, function (part) {
      addPart('/', part);
    });
    if (self.hashPart)
      // XXX don't force it to be optional just because it's the hash part
      addPart('#', self.hashPart, true);

    return ret;
  }
});

// Page.define('article', '/a/:book/:article#:section')
// Then if the URL is /a/foo/bar#baz:
//   Page.get('name') === 'article'
//   Page.get('book') === 'foo'
//   Page.get('article') === 'bar'
//   Page.get('section') === 'baz'
// XXX support optional segments, glob segments, regexps
// XXX iron-router style or rails style?
// XXX support query strings
// XXX types? (so that integer parameters come out as integers?)
//
// XXX what I'd like to have is reactive functions that can fill in
// the value for params that are optional but omitted
Page.define = function (name, pattern) {
  if (_.has(routes, name))
    throw new Error("There is already a page named '" + name + "'");
  routes[name] = new Route(name, pattern);
};

// Whenever the current location changes, find the matching route (if
// any) and update the page variables in 'dict'.
Meteor.autorun(function () {
  var parts = Location.getParts(); // path, query, fragment
  var params = null;

  _.each(routes, function (route) {
    params = params || route.matches(parts);
  });

  if (! params)
    params = {}; // no matching routes

  // set the contents dict to be exactly 'params' (clearing out any old keys)
  _.each(currentKeys, function (key) {
    if (! _.has(params, key))
      dict.set(key, undefined);
  });
  _.each(params, function (value, key) {
    dict.set(key, value);
  });
  currentKeys = _.keys(params);
});

Page.get = function (key) {
  return dict.get(key);
};

Page.equals = function (key, value) {
  return dict.equals(key, value);
};

// Page.url('article', {book: 'foo', article: 'bar', section: 'baz'})
//   == '/a/foo/bar#baz'
Page.url = function (name, params) {
  if (! _.has(routes, name))
    throw new Error("No such page '" + name + "'");
  return routes[name].url(params);
};
// By adding this package, you get the following default policy:
// No eval or other string-to-code, and content can only be loaded from the
// same origin as the app (except for XHRs and websocket connections, which can
// go to any origin).
//
// Apps should call BrowserPolicy.content.disallowInlineScripts() if they are
// not using any inline script tags and are willing to accept an extra round
// trip on page load.
//
// BrowserPolicy.content functions for tweaking CSP:
// allowInlineScripts()
// disallowInlineScripts(): adds extra round-trip to page load time
// allowInlineStyles()
// disallowInlineStyles()
// allowEval()
// disallowEval()
//
// For each type of content (script, object, image, media, font, connect,
// style), there are the following functions:
// allow<content type>Origin(origin): allows the type of content to be loaded
// from the given origin
// allow<content type>DataUrl(): allows the content to be loaded from data: URLs
// allow<content type>SameOrigin(): allows the content to be loaded from the
// same origin
// disallow<content type>(): disallows this type of content all together (can't
// be called for script)
//
// The following functions allow you to set rules for all types of content at
// once:
// allowAllContentOrigin(origin)
// allowAllContentDataUrl()
// allowAllContentSameOrigin()
// disallowAllContent()
//

var cspSrcs;
var cachedCsp; // Avoid constructing the header out of cspSrcs when possible.

// CSP keywords have to be single-quoted.
var unsafeInline = "'unsafe-inline'";
var unsafeEval = "'unsafe-eval'";
var selfKeyword = "'self'";
var noneKeyword = "'none'";

BrowserPolicy.content = {};

var parseCsp = function (csp) {
  var policies = csp.split("; ");
  cspSrcs = {};
  _.each(policies, function (policy) {
    if (policy[policy.length - 1] === ";")
      policy = policy.substring(0, policy.length - 1);
    var srcs = policy.split(" ");
    var directive = srcs[0];
    if (_.indexOf(srcs, noneKeyword) !== -1)
      cspSrcs[directive] = null;
    else
      cspSrcs[directive] = srcs.slice(1);
  });

  if (cspSrcs["default-src"] === undefined)
    throw new Error("Content Security Policies used with " +
                    "browser-policy must specify a default-src.");

  // Copy default-src sources to other directives.
  _.each(cspSrcs, function (sources, directive) {
    cspSrcs[directive] = _.union(sources || [], cspSrcs["default-src"] || []);
  });
};

var removeCspSrc = function (directive, src) {
  cspSrcs[directive] = _.without(cspSrcs[directive] || [], src);
};

// Prepare for a change to cspSrcs. Ensure that we have a key in the dictionary
// and clear any cached CSP.
var prepareForCspDirective = function (directive) {
  cspSrcs = cspSrcs || {};
  cachedCsp = null;
  if (! _.has(cspSrcs, directive))
    cspSrcs[directive] = _.clone(cspSrcs["default-src"]);
};

var setDefaultPolicy = function () {
  // By default, unsafe inline scripts and styles are allowed, since we expect
  // many apps will use them for analytics, etc. Unsafe eval is disallowed, and
  // the only allowable content source is the same origin or data, except for
  // connect which allows anything (since meteor.com apps make websocket
  // connections to a lot of different origins).
  BrowserPolicy.content.setPolicy("default-src 'self'; " +
                                  "script-src 'self' 'unsafe-inline'; " +
                                  "connect-src *; " +
                                  "img-src data: 'self'; " +
                                  "style-src 'self' 'unsafe-inline';");
};

var setWebAppInlineScripts = function (value) {
  if (! BrowserPolicy._runningTest())
    WebAppInternals.setInlineScriptsAllowed(value);
};

_.extend(BrowserPolicy.content, {
  // Exported for tests and browser-policy-common.
  _constructCsp: function () {
    if (! cspSrcs || _.isEmpty(cspSrcs))
      return null;

    if (cachedCsp)
      return cachedCsp;

    var header = _.map(cspSrcs, function (srcs, directive) {
      srcs = srcs || [];
      if (_.isEmpty(srcs))
        srcs = [noneKeyword];
      var directiveCsp = _.uniq(srcs).join(" ");
      return directive + " " + directiveCsp + ";";
    });

    header = header.join(" ");
    cachedCsp = header;
    return header;
  },
  _reset: function () {
    cachedCsp = null;
    setDefaultPolicy();
  },

  setPolicy: function (csp) {
    cachedCsp = null;
    parseCsp(csp);
    setWebAppInlineScripts(
      BrowserPolicy.content._keywordAllowed("script-src", unsafeInline)
    );
  },

  _keywordAllowed: function (directive, keyword) {
    return (cspSrcs[directive] &&
            _.indexOf(cspSrcs[directive], keyword) !== -1);
  },

  // Helpers for creating content security policies

  allowInlineScripts: function () {
    prepareForCspDirective("script-src");
    cspSrcs["script-src"].push(unsafeInline);
    setWebAppInlineScripts(true);
  },
  disallowInlineScripts: function () {
    prepareForCspDirective("script-src");
    removeCspSrc("script-src", unsafeInline);
    setWebAppInlineScripts(false);
  },
  allowEval: function () {
    prepareForCspDirective("script-src");
    cspSrcs["script-src"].push(unsafeEval);
  },
  disallowEval: function () {
    prepareForCspDirective("script-src");
    removeCspSrc("script-src", unsafeEval);
  },
  allowInlineStyles: function () {
    prepareForCspDirective("style-src");
    cspSrcs["style-src"].push(unsafeInline);
  },
  disallowInlineStyles: function () {
    prepareForCspDirective("style-src");
    removeCspSrc("style-src", unsafeInline);
  },

  // Functions for setting defaults
  allowSameOriginForAll: function () {
    BrowserPolicy.content.allowOriginForAll(selfKeyword);
  },
  allowDataUrlForAll: function () {
    BrowserPolicy.content.allowOriginForAll("data:");
  },
  allowOriginForAll: function (origin) {
    prepareForCspDirective("default-src");
    _.each(_.keys(cspSrcs), function (directive) {
      cspSrcs[directive].push(origin);
    });
  },
  disallowAll: function () {
    cachedCsp = null;
    cspSrcs = {
      "default-src": []
    };
    setWebAppInlineScripts(false);
  }
});

// allow<Resource>Origin, allow<Resource>Data, allow<Resource>self, and
// disallow<Resource> methods for each type of resource.
_.each(["script", "object", "img", "media",
        "font", "connect", "style"],
       function (resource) {
         var directive = resource + "-src";
         var methodResource;
         if (resource !== "img") {
           methodResource = resource.charAt(0).toUpperCase() +
             resource.slice(1);
         } else {
           methodResource = "Image";
         }
         var allowMethodName = "allow" + methodResource + "Origin";
         var disallowMethodName = "disallow" + methodResource;
         var allowDataMethodName = "allow" + methodResource + "DataUrl";
         var allowSelfMethodName = "allow" + methodResource + "SameOrigin";

         var disallow = function () {
           cachedCsp = null;
           cspSrcs[directive] = [];
         };

         BrowserPolicy.content[allowMethodName] = function (src) {
           prepareForCspDirective(directive);
           cspSrcs[directive].push(src);
         };
         if (resource === "script") {
           BrowserPolicy.content[disallowMethodName] = function () {
             disallow();
             setWebAppInlineScripts(false);
           };
         } else {
           BrowserPolicy.content[disallowMethodName] = disallow;
         }
         BrowserPolicy.content[allowDataMethodName] = function () {
           prepareForCspDirective(directive);
           cspSrcs[directive].push("data:");
         };
         BrowserPolicy.content[allowSelfMethodName] = function () {
           prepareForCspDirective(directive);
           cspSrcs[directive].push(selfKeyword);
         };
       });


setDefaultPolicy();

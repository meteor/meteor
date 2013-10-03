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

var ensureDirective = function (directive) {
  cspSrcs = cspSrcs || {};
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

_.extend(BrowserPolicy.content, {
  // Exported for tests and browser-policy-common.
  _constructCsp: function () {
    if (! cspSrcs || _.isEmpty(cspSrcs))
      return null;

    var header = _.map(cspSrcs, function (srcs, directive) {
      srcs = srcs || [];
      if (_.isEmpty(srcs))
        srcs = [noneKeyword];
      var directiveCsp = _.uniq(srcs).join(" ");
      return directive + " " + directiveCsp + ";";
    });

    header = header.join(" ");
    return header;
  },
  _reset: function () {
    setDefaultPolicy();
  },

  setPolicy: function (csp) {
    parseCsp(csp);
  },

  _keywordAllowed: function (directive, keyword) {
    return (cspSrcs[directive] &&
            _.indexOf(cspSrcs[directive], keyword) !== -1);
  },

  // Used by webapp to determine whether we need an extra round trip for
  // __meteor_runtime_config__.  If we're in a test run, we should always return
  // true, since CSP headers are never sent on tests -- unless the
  // _calledFromTests flag is set, in which case a test is testing what
  // inlineScriptsAllowed() would return if we weren't in a test. Wphew.
  // XXX maybe this test interface could be cleaned up
  inlineScriptsAllowed: function (_calledFromTests) {
    if (BrowserPolicy._runningTest() && ! _calledFromTests)
      return true;

    return BrowserPolicy.content._keywordAllowed("script-src",
                                                 unsafeInline);
  },

  // Helpers for creating content security policies

  allowInlineScripts: function () {
    ensureDirective("script-src");
    cspSrcs["script-src"].push(unsafeInline);
  },
  disallowInlineScripts: function () {
    ensureDirective("script-src");
    removeCspSrc("script-src", unsafeInline);
  },
  allowEval: function () {
    ensureDirective("script-src");
    cspSrcs["script-src"].push(unsafeEval);
  },
  disallowEval: function () {
    ensureDirective("script-src");
    removeCspSrc("script-src", unsafeEval);
  },
  allowInlineStyles: function () {
    ensureDirective("style-src");
    cspSrcs["style-src"].push(unsafeInline);
  },
  disallowInlineStyles: function () {
    ensureDirective("style-src");
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
    ensureDirective("default-src");
    _.each(_.keys(cspSrcs), function (directive) {
      cspSrcs[directive].push(origin);
    });
  },
  disallowAll: function () {
    cspSrcs = {
      "default-src": []
    };
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

         BrowserPolicy.content[allowMethodName] = function (src) {
           ensureDirective(directive);
           cspSrcs[directive].push(src);
         };
         BrowserPolicy.content[disallowMethodName] = function () {
           cspSrcs[directive] = [];
         };
         BrowserPolicy.content[allowDataMethodName] = function () {
           ensureDirective(directive);
           cspSrcs[directive].push("data:");
         };
         BrowserPolicy.content[allowSelfMethodName] = function () {
           ensureDirective(directive);
           cspSrcs[directive].push(selfKeyword);
         };
       });


setDefaultPolicy();

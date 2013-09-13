// To enable CSP, call BrowserPolicy.enableContentSecurityPolicy(). This enables
// the following default policy:
// No eval or other string-to-code, and content can only be loaded from the
// same origin as the app (except for XHRs and websocket connections, which can
// go to any origin).
//
// Apps should call BrowserPolicy.allowFramingBySameOrigin() to allow only
// same-origin pages to frame their apps, if they don't explicitly want to be
// framed by third-party sites.
//
// Apps should call BrowserPolicy.disallowInlineScripts() if they are not using
// any inline script tags and are willing to accept an extra round trip on page
// load.
//
// BrowserPolicy functions for tweaking CSP:
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
//
// For controlling which origins can frame this app,
// BrowserPolicy.disallowFraming()
// BrowserPolicy.allowFramingByOrigin(origin)
// BrowserPolicy.allowFramingBySameOrigin()
// BrowserPolicy.allowFramingByAnyOrigin();

var xFrameOptions;
var cspSrcs;

// CSP keywords have to be single-quoted.
var unsafeInline = "'unsafe-inline'";
var unsafeEval = "'unsafe-eval'";
var selfKeyword = "'self'";
var noneKeyword = "'none'";

var cspEnabled = false;
var cspEnabledForTests = false;

BrowserPolicy = {};

// Exported for tests.
var constructXFrameOptions = BrowserPolicy._constructXFrameOptions =
      function () {
        return xFrameOptions;
      };

var constructCsp = BrowserPolicy._constructCsp = function () {
  cspSrcs = cspSrcs || {};

  var header = _.map(cspSrcs, function (srcs, directive) {
    srcs = srcs || [];
    if (_.isEmpty(srcs))
      srcs = [noneKeyword];
    var directiveCsp = _.uniq(srcs).join(" ");
    return directive + " " + directiveCsp + ";";
  });

  header = header.join(" ");
  return header;
};

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
  throwIfNotEnabled();
  cspSrcs = cspSrcs || {};
  if (! _.has(cspSrcs, directive))
    cspSrcs[directive] = _.clone(cspSrcs["default-src"]);
};

var throwIfNotEnabled = function () {
  if (! cspEnabled && ! cspEnabledForTests)
    throw new Error("Enable this function by calling "+
                    "BrowserPolicy.enableContentSecurityPolicy().");
};

WebApp.connectHandlers.use(function (req, res, next) {
  if (xFrameOptions)
    res.setHeader("X-Frame-Options", constructXFrameOptions());
  if (cspEnabled)
    res.setHeader("Content-Security-Policy", constructCsp());
  next();
});

BrowserPolicy = _.extend(BrowserPolicy, {
  _reset: function () {
    xFrameOptions = null;
    cspSrcs = null;
    cspEnabled = false;
  },

  allowFramingBySameOrigin: function () {
    xFrameOptions = "SAMEORIGIN";
  },
  disallowFraming: function () {
    xFrameOptions = "DENY";
  },
  // ALLOW-FROM not supported in Chrome or Safari.
  allowFramingByOrigin: function (origin) {
    // Trying to specify two allow-from throws to prevent users from
    // accidentally overwriting an allow-from origin when they think they are
    // adding multiple origins.
    if (xFrameOptions && xFrameOptions.indexOf("ALLOW-FROM") === 0)
      throw new Error("You can only specify one origin that is allowed to" +
                      " frame this app.");
    xFrameOptions = "ALLOW-FROM " + origin;
  },
  allowFramingByAnyOrigin: function () {
    xFrameOptions = null;
  },

  // _enableForTests means that you can call CSP functions, but the header won't
  // actually be sent.
  enableContentSecurityPolicy: function (_enableForTests) {
    // By default, unsafe inline scripts and styles are allowed, since we expect
    // many apps will use them for analytics, etc. Unsafe eval is disallowed, and
    // the only allowable content source is the same origin or data, except for
    // connect which allows anything (since meteor.com apps make websocket
    // connections to a lot of different origins).
    if (! _enableForTests)
      cspEnabled = true;
    else
      cspEnabledForTests = true;
    cspSrcs = {};
    BrowserPolicy.setContentSecurityPolicy("default-src 'self'; " +
                                           "script-src 'self' 'unsafe-inline'; " +
                                           "connect-src *; " +
                                           "img-src data: 'self'; " +
                                           "style-src 'self' 'unsafe-inline';");
  },

  setContentSecurityPolicy: function (csp) {
    throwIfNotEnabled();
    parseCsp(csp);
  },

  // Helpers for creating content security policies

  _keywordAllowed: function (directive, keyword, _calledFromTests) {
    // All keywords are allowed if csp is not enabled and we're not in a test
    // run. If csp is enabled or we're in a test run, then look in cspSrcs to
    // see if it's allowed.
    return (! cspEnabled && ! _calledFromTests) ||
      (cspSrcs[directive] &&
       _.indexOf(cspSrcs[directive], keyword) !== -1);
  },

  // Used by webapp to determine whether we need an extra round trip for
  // __meteor_runtime_config__.
  // _calledFromTests is used to indicate that we should ignore cspEnabled and
  // instead look directly in cspSrcs to determine if the keyword is allowed.
  // XXX maybe this test interface could be cleaned up
  inlineScriptsAllowed: function (_calledFromTests) {
    return BrowserPolicy._keywordAllowed("script-src",
                                         unsafeInline, _calledFromTests);
  },

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
  allowAllContentSameOrigin: function () {
    BrowserPolicy.allowAllContentOrigin(selfKeyword);
  },
  allowAllContentDataUrl: function () {
    BrowserPolicy.allowAllContentOrigin("data:");
  },
  allowAllContentOrigin: function (origin) {
    ensureDirective("default-src");
    _.each(_.keys(cspSrcs), function (directive) {
      cspSrcs[directive].push(origin);
    });
  },
  disallowAllContent: function () {
    throwIfNotEnabled();
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

         BrowserPolicy[allowMethodName] = function (src) {
           ensureDirective(directive);
           cspSrcs[directive].push(src);
         };
         BrowserPolicy[disallowMethodName] = function () {
           throwIfNotEnabled();
           cspSrcs[directive] = [];
         };
         BrowserPolicy[allowDataMethodName] = function () {
           ensureDirective(directive);
           cspSrcs[directive].push("data:");
         };
         BrowserPolicy[allowSelfMethodName] = function () {
           ensureDirective(directive);
           cspSrcs[directive].push(selfKeyword);
         };
       });

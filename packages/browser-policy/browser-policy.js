// We recommend that you use the starter-browser-policy package to enable the
// following default policy:
// 1.) Only the same origin can frame the app.
// 2.) No eval or other string-to-code, and content can only be loaded from the
// same origin as the app (except for XHRs and websocket connections, which can
// go to any origin).
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
// The following functions allow you to set defaults for where content can be
// loaded from when no other rules have been specified for that type of content:
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

var constructCsp = function () {
  _.each(_.keys(cspSrcs), function (directive) {
    if (_.isEmpty(cspSrcs[directive]))
      delete cspSrcs[directive];
  });

  var header = _.map(cspSrcs, function (srcs, directive) {
    return directive + " " + srcs.join(" ") + ";";
  }).join(" ");

  return header;
};

var parseCsp = function (csp) {
  var policies = csp.split("; ");
  var result = {};
  _.each(policies, function (policy) {
    if (policy[policy.length-1] === ";")
      policy = policy.substring(0, policy.length - 1);
    var srcs = policy.split(" ");
    var directive = srcs[0];
    result[directive] = srcs.slice(1);
  });
  return result;
};

var removeCspSrc = function (directive, src) {
  cspSrcs[directive] = _.without(cspSrcs[directive] || [], src);
};

var ensureDirective = function (directive) {
  if (! _.has(cspSrcs, directive))
    cspSrcs[directive] = [];
};

WebApp.connectHandlers.use(function (req, res, next) {
  if (xFrameOptions)
    res.setHeader("X-Frame-Options", xFrameOptions);
  if (cspSrcs)
    res.setHeader("Content-Security-Policy", constructCsp());
  next();
});

BrowserPolicy = {
  allowFramingBySameOrigin: function () {
    xFrameOptions = "SAMEORIGIN";
  },
  disallowFraming: function () {
    xFrameOptions = "DENY";
  },
  allowFramingByOrigin: function (origin) {
    if (xFrameOptions.indexOf("ALLOW-FROM") === 0)
      throw new Error("You can only specify one origin that is allowed to" +
                      " frame this app.");
    xFrameOptions = "ALLOW-FROM " + origin;
  },
  allowFramingByAnyOrigin: function () {
    xFrameOptions = null;
  },

  setContentSecurityPolicy: function (csp) {
    cspSrcs = parseCsp(csp);
  },

  // Helpers for creating content security policies

  // Used by webapp to determine whether we need an extra round trip for
  // __meteor_runtime_config__.
  inlineScriptsAllowed: function () {
    ensureDirective("script-src");
    return (_.indexOf(cspSrcs["script-src"], unsafeInline) !== -1);
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
    ensureDirective("default-src");
    cspSrcs["default-src"].push(selfKeyword);
  },
  allowAllContentDataUrl: function () {
    ensureDirective("default-src");
    cspSrcs["default-src"].push("data:");
  },
  allowAllContentOrigin: function (origin) {
    ensureDirective("default-src");
    cspSrcs["default-src"].push(origin);
  },
  disallowAllContent: function () {
    cspSrcs["default-src"] = [noneKeyword];
  }
};

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
         if (resource !== "script") {
           BrowserPolicy[disallowMethodName] = function () {
             cspSrcs[directive] = [noneKeyword];
           };
         }
         BrowserPolicy[allowDataMethodName] = function () {
           ensureDirective(directive);
           cspSrcs[directive].push("data:");
         };
       });

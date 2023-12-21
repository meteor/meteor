// By adding this package, you get the following default policy:
// No eval or other string-to-code, and content can only be loaded from the
// same origin as the app (except for XHRs and websocket connections, which can
// go to any origin). Browsers will also be told not to sniff content types
// away from declared content types (X-Content-Type-Options: nosniff).
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
// style, frame, frame-ancestors), there are the following functions:
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
// You can allow content type sniffing by calling
// `BrowserPolicy.content.allowContentTypeSniffing()`.

var cspSrcs;
var cachedCsp; // Avoid constructing the header out of cspSrcs when possible.

// CSP keywords have to be single-quoted.
var keywords = {
  unsafeInline: "'unsafe-inline'",
  unsafeEval: "'unsafe-eval'",
  self: "'self'",
  none: "'none'"
};

// If false, we set the X-Content-Type-Options header to 'nosniff'.
var contentSniffingAllowed = false;

var BrowserPolicy = require("meteor/browser-policy-common").BrowserPolicy;
BrowserPolicy.content = {};

var mergeUnique = function (firstArray, secondArray) {
  return firstArray.concat(secondArray.filter(function (item) {return firstArray.indexOf(item) < 0}));
}

var parseCsp = function (csp) {
  var policies = csp.split("; ");
  cspSrcs = {};
  policies.forEach(function (policy) {
    if (policy[policy.length - 1] === ";")
      policy = policy.substring(0, policy.length - 1);
    var srcs = policy.split(" ");
    var directive = srcs[0];
    if (srcs.indexOf(keywords.none) !== -1)
      cspSrcs[directive] = null;
    else
      cspSrcs[directive] = srcs.slice(1);
  });

  if (cspSrcs["default-src"] === undefined)
    throw new Error("Content Security Policies used with " +
                    "browser-policy must specify a default-src.");

  // Copy default-src sources to other directives.
  Object.entries(cspSrcs).forEach(function (entry) {
    var directive = entry[0];
    var sources = entry[1];
    cspSrcs[directive] = mergeUnique(sources || [], cspSrcs["default-src"] || []);
  });
};

var removeCspSrc = function (directive, src) {
  cspSrcs[directive] = (cspSrcs[directive] || []).filter(function(value) {
    return value !== src;
  });
};

// Prepare for a change to cspSrcs. Ensure that we have a key in the dictionary
// and clear any cached CSP.
var prepareForCspDirective = function (directive) {
  cspSrcs = cspSrcs || {};
  cachedCsp = null;
  if (!(directive in cspSrcs))
    cspSrcs[directive] = [].concat(cspSrcs["default-src"]);
};

// Add `src` to the list of allowed sources for `directive`, with the
// following modifications if `src` is an origin:
// - If `src` does not have a protocol specified, then add both
//   http://<src> and https://<src>. This is to mask differing
//   cross-browser behavior; some browsers interpret an origin without a
//   protocol as http://<src> and some interpret it as both http://<src>
//   and https://<src>
// - Trim trailing slashes from `src`, since some browsers interpret
//   "foo.com/" as "foo.com" and some don't.
var addSourceForDirective = function (directive, src) {
  if (Object.values(keywords).includes(src)) {
    cspSrcs[directive].push(src);
  } else {
    var toAdd = [];

    //Only add single quotes to CSP2 script digests
    if (/^(sha(256|384|512)|nonce)-/i.test(src)) {
      toAdd.push("'" + src + "'");
    } else {
      src = src.toLowerCase();

      // Trim trailing slashes.
      src = src.replace(/\/+$/, '');

      // If there is no protocol, add both http:// and https://.
      if (! /^([a-z0-9.+-]+:)/.test(src)) {
        toAdd.push("http://" + src);
        toAdd.push("https://" + src);
      } else {
        toAdd.push(src);
      }
    }

    toAdd.forEach(function (s) {
      cspSrcs[directive].push(s);
    });
  }
};

var setDefaultPolicy = async function () {
  // By default, unsafe inline scripts and styles are allowed, since we expect
  // many apps will use them for analytics, etc. Unsafe eval is disallowed, and
  // the only allowable content source is the same origin or data, except for
  // connect which allows anything (since meteor.com apps make websocket
  // connections to a lot of different origins).
  await BrowserPolicy.content.setPolicy("default-src 'self'; " +
                                  "script-src 'self' 'unsafe-inline'; " +
                                  "connect-src *; " +
                                  "img-src data: 'self'; " +
                                  "style-src 'self' 'unsafe-inline';");
  contentSniffingAllowed = false;
};

var setWebAppInlineScripts = async function (value) {
  if (! BrowserPolicy._runningTest())
    await WebAppInternals.setInlineScriptsAllowed(value);
};

Object.assign(BrowserPolicy.content, {
  allowContentTypeSniffing: function () {
    contentSniffingAllowed = true;
  },
  // Exported for tests and browser-policy-common.
  _constructCsp: function () {
    if (! cspSrcs || (Object.keys(cspSrcs).length === 0 && cspSrcs.constructor === Object))
      return null;

    if (cachedCsp)
      return cachedCsp;

      var header = Object.entries(cspSrcs).map(function (entry) {
        var directive = entry[0];
        var srcs = entry[1];
        srcs = srcs || [];
        if ((!Array.isArray(srcs) || !srcs.length))
          srcs = [keywords.none];
        var directiveCsp = srcs.filter(function(value, index, array) {return array.indexOf(value) === index}).join(" ");
        return directive + " " + directiveCsp + ";";
      });

    header = header.join(" ");
    cachedCsp = header;
    return header;
  },
  _reset: async function () {
    cachedCsp = null;
    await setDefaultPolicy();
  },

  setPolicy: async function (csp) {
    cachedCsp = null;
    parseCsp(csp);
    await setWebAppInlineScripts(
      BrowserPolicy.content._keywordAllowed("script-src", keywords.unsafeInline)
    );
  },

  _keywordAllowed: function (directive, keyword) {
    return (cspSrcs[directive] &&
      cspSrcs[directive].indexOf(keyword) !== -1)
  },

  // Helpers for creating content security policies

  allowInlineScripts: async function () {
    prepareForCspDirective("script-src");
    cspSrcs["script-src"].push(keywords.unsafeInline);
    await setWebAppInlineScripts(true);
  },
  disallowInlineScripts: async function () {
    prepareForCspDirective("script-src");
    removeCspSrc("script-src", keywords.unsafeInline);
    await setWebAppInlineScripts(false);
  },
  allowEval: function () {
    prepareForCspDirective("script-src");
    cspSrcs["script-src"].push(keywords.unsafeEval);
  },
  disallowEval: function () {
    prepareForCspDirective("script-src");
    removeCspSrc("script-src", keywords.unsafeEval);
  },
  allowInlineStyles: function () {
    prepareForCspDirective("style-src");
    cspSrcs["style-src"].push(keywords.unsafeInline);
  },
  disallowInlineStyles: function () {
    prepareForCspDirective("style-src");
    removeCspSrc("style-src", keywords.unsafeInline);
  },

  // Functions for setting defaults
  allowSameOriginForAll: function () {
    BrowserPolicy.content.allowOriginForAll(keywords.self);
  },
  allowDataUrlForAll: function () {
    BrowserPolicy.content.allowOriginForAll("data:");
  },
  allowOriginForAll: function (origin) {
    prepareForCspDirective("default-src");
    Object.keys(cspSrcs).forEach(function (directive) {
      addSourceForDirective(directive, origin);
    });
  },
  disallowAll: async function () {
    cachedCsp = null;
    cspSrcs = {
      "default-src": []
    };
    await setWebAppInlineScripts(false);
  },

  _xContentTypeOptions: function () {
    if (! contentSniffingAllowed) {
      return "nosniff";
    }
  }
});

// allow<Resource>Origin, allow<Resource>Data, allow<Resource>self, and
// disallow<Resource> methods for each type of resource.
var resources = [
  { methodResource: "Script", directive: "script-src" },
  { methodResource: "Object", directive: "object-src" },
  { methodResource: "Image", directive: "img-src" },
  { methodResource: "Media", directive: "media-src" },
  { methodResource: "Font", directive: "font-src" },
  { methodResource: "Connect", directive: "connect-src" },
  { methodResource: "Style", directive: "style-src" },
  { methodResource: "Frame", directive: "frame-src" },
  { methodResource: "FrameAncestors", directive: "frame-ancestors" }
];
resources.forEach(function (resource) {
  var directive = resource.directive;
  var methodResource = resource.methodResource;
  var allowMethodName = "allow" + methodResource + "Origin";
  var disallowMethodName = "disallow" + methodResource;
  var allowDataMethodName = "allow" + methodResource + "DataUrl";
  var allowBlobMethodName = "allow" + methodResource + "BlobUrl";
  var allowSelfMethodName = "allow" + methodResource + "SameOrigin";

  var disallow = function () {
    cachedCsp = null;
    cspSrcs[directive] = [];
  };

  BrowserPolicy.content[allowMethodName] = function (src) {
    prepareForCspDirective(directive);
    addSourceForDirective(directive, src);
  };
  if (resource === "script") {
    BrowserPolicy.content[disallowMethodName] = async function () {
      disallow();
      await setWebAppInlineScripts(false);
    };
  } else {
    BrowserPolicy.content[disallowMethodName] = disallow;
  }
  BrowserPolicy.content[allowDataMethodName] = function () {
    prepareForCspDirective(directive);
    cspSrcs[directive].push("data:");
  };
  BrowserPolicy.content[allowBlobMethodName] = function () {
    prepareForCspDirective(directive);
    cspSrcs[directive].push("blob:");
  };
  BrowserPolicy.content[allowSelfMethodName] = function () {
    prepareForCspDirective(directive);
    cspSrcs[directive].push(keywords.self);
  };
});

await setDefaultPolicy();

exports.BrowserPolicy = BrowserPolicy;
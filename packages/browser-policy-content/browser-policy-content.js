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
import { BrowserPolicy } from 'meteor/browser-policy-common';

let cspSrcs;
let cachedCsp; // Avoid constructing the header out of cspSrcs when possible.

// CSP keywords have to be single-quoted.
const keywords = {
  unsafeInline: "'unsafe-inline'",
  unsafeEval: "'unsafe-eval'",
  self: "'self'",
  none: "'none'"
};

// If false, we set the X-Content-Type-Options header to 'nosniff'.
let contentSniffingAllowed = false;

BrowserPolicy.content = {};

const parseCsp = csp => {
  const policies = csp.split("; ");
  cspSrcs = {};
  policies.forEach(policy => {
    if (policy[policy.length - 1] === ";") {
      policy = policy.substring(0, policy.length - 1);
    }

    const srcs = policy.split(" ");
    const directive = srcs[0];
    if (srcs.includes(keywords.none)) {
      cspSrcs[directive] = null;
    } else {
      cspSrcs[directive] = srcs.slice(1);
    }
  });

  if (cspSrcs["default-src"] === undefined) {
    throw new Error("Content Security Policies used with " +
                    "browser-policy must specify a default-src.");
  }

  // Copy default-src sources to other directives.
  Object.keys(cspSrcs).forEach(directive => {
    const sources = cspSrcs[directive] || [];
    cspSrcs[directive] = [
      ...sources,
      ...(cspSrcs["default-src"] || []).filter(source => !sources.includes(source)),
    ];
  });
};

const removeCspSrc = (directive, src) =>
  cspSrcs[directive] = 
    (cspSrcs[directive] || []).filter(source => source !== src);

// Prepare for a change to cspSrcs. Ensure that we have a key in the dictionary
// and clear any cached CSP.
const prepareForCspDirective = directive => {
  cspSrcs = cspSrcs || {};
  cachedCsp = null;
  if (! cspSrcs.hasOwnProperty(directive)) {
    cspSrcs[directive] = [...cspSrcs["default-src"]];
  }
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
const addSourceForDirective = (directive, src) => {
  if (Object.values(keywords).includes(src)) {
    cspSrcs[directive].push(src);
  } else {
    const toAdd = [];

    //Only add single quotes to CSP2 script digests
    if (/^(sha(256|384|512)-)/i.test(src)) {
      toAdd.push("'" + src + "'");
    } else {
      src = src.toLowerCase();

      // Trim trailing slashes.
      src = src.replace(/\/+$/, '');

      // If there is no protocol, add both http:// and https://.
      if (! /^([a-z0-9.+-]+:)/.test(src)) {
        toAdd.push(`http://${src}`);
        toAdd.push(`https://${src}`);
      } else {
        toAdd.push(src);
      }
    }

    cspSrcs[directive] = [...cspSrcs[directive], ...toAdd];
  }
};

const setDefaultPolicy = () => {
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
  contentSniffingAllowed = false;
};

const setWebAppInlineScripts = value =>
  ! BrowserPolicy._runningTest() &&
    WebAppInternals.setInlineScriptsAllowed(value);

Object.assign(BrowserPolicy.content, {
  allowContentTypeSniffing() {
    contentSniffingAllowed = true
  },

  // Exported for tests and browser-policy-common.
  _constructCsp() {
    if (! cspSrcs || Object.keys(cspSrcs).lenth === 0) {
      return null;
    }

    if (cachedCsp) {
      return cachedCsp;
    }

    let header = Object.keys(cspSrcs).map(directive => {
      srcs = cspSrcs[directive] || [];
      if (srcs.length === 0) {
        srcs = [keywords.none];
      }

      const directiveCsp = srcs.reduce(
        (prev, src) => !prev.includes(src) ? [...prev, src] : prev,
        []
      ).join(" ");
      return `${directive} ${directiveCsp};`;
    });

    header = header.join(" ");
    cachedCsp = header;
    return header;
  },

  _reset() {
    cachedCsp = null;
    setDefaultPolicy();
  },

  setPolicy(csp) {
    cachedCsp = null;
    parseCsp(csp);
    setWebAppInlineScripts(
      BrowserPolicy.content._keywordAllowed("script-src", keywords.unsafeInline)
    );
  },

  _keywordAllowed(directive, keyword) {
    return cspSrcs[directive] && cspSrcs[directive].includes(keyword);
  },

  // Helpers for creating content security policies

  allowInlineScripts() {
    prepareForCspDirective("script-src");
    cspSrcs["script-src"].push(keywords.unsafeInline);
    setWebAppInlineScripts(true);
  },

  disallowInlineScripts() {
    prepareForCspDirective("script-src");
    removeCspSrc("script-src", keywords.unsafeInline);
    setWebAppInlineScripts(false);
  },

  allowEval() {
    prepareForCspDirective("script-src");
    cspSrcs["script-src"].push(keywords.unsafeEval);
  },

  disallowEval() {
    prepareForCspDirective("script-src");
    removeCspSrc("script-src", keywords.unsafeEval);
  },

  allowInlineStyles() {
    prepareForCspDirective("style-src");
    cspSrcs["style-src"].push(keywords.unsafeInline);
  },

  disallowInlineStyles() {
    prepareForCspDirective("style-src");
    removeCspSrc("style-src", keywords.unsafeInline);
  },

  // Functions for setting defaults
  allowSameOriginForAll() {
    BrowserPolicy.content.allowOriginForAll(keywords.self);
  },

  allowDataUrlForAll() {
    BrowserPolicy.content.allowOriginForAll("data:");
  },

  allowOriginForAll(origin) {
    prepareForCspDirective("default-src");
    Object.keys(cspSrcs).forEach(
      directive => addSourceForDirective(directive, origin)
    );
  },

  disallowAll() {
    cachedCsp = null;
    cspSrcs = {
      "default-src": []
    };
    setWebAppInlineScripts(false);
  },

  _xContentTypeOptions() {
    if (! contentSniffingAllowed) {
      return "nosniff";
    }
  }
});

// allow<Resource>Origin, allow<Resource>Data, allow<Resource>self, and
// disallow<Resource> methods for each type of resource.
const resources = [
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
resources.forEach(resource => {
  const { directive, methodResource } = resource;
  const allowMethodName = `allow${methodResource}Origin`;
  const disallowMethodName = `disallow${methodResource}`;
  const allowDataMethodName = `allow${methodResource}DataUrl`;
  const allowBlobMethodName = `allow${methodResource}BlobUrl`;
  const allowSelfMethodName = `allow${methodResource}SameOrigin`;

  const disallow = () => {
    cachedCsp = null;
    cspSrcs[directive] = [];
  };

  Object.assign(BrowserPolicy.content, {
    [allowMethodName](src) {
      prepareForCspDirective(directive);
      addSourceForDirective(directive, src);
    },

    [allowDataMethodName]() {
      prepareForCspDirective(directive);
      cspSrcs[directive].push("data:");
    },

    [allowBlobMethodName]() {
      prepareForCspDirective(directive);
      cspSrcs[directive].push("blob:");
    },

    [allowSelfMethodName]() {
      prepareForCspDirective(directive);
      cspSrcs[directive].push(keywords.self);
    },
  })

  if (resource === "script") {
    Object.assign(BrowserPolicy.content, {
      [disallowMethodName]() {
        disallow();
        setWebAppInlineScripts(false);
      },
    });
  } else {
    Object.assign(BrowserPolicy.content, {
      [disallowMethodName]() {
        disallow();
      },
    });
  }
});

setDefaultPolicy();

export { BrowserPolicy };

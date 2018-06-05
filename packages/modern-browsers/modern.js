const minimumVersions = Object.create(null);
const hasOwn = Object.prototype.hasOwnProperty;

// By default, any minimum versions specified for chrome should apply to
// chromeMobile too, per https://github.com/meteor/meteor/pull/9793,
// though it should also be possible to specify minimum versions
// specifically for chromeMobile. This map defines that aliasing behavior
// in a generic way that could work for other browsers as well.
const browserAliases = {
  chrome: [
    "chromeMobile",
    "chromeMobileIOS",
  ],

  // If a call to setMinimumBrowserVersions specifies Edge 12 as a minimum
  // version, that means no version of Internet Explorer pre-Edge should
  // be classified as modern. This edge:["ie"] alias effectively enforces
  // that logic, because there is no IE12. #9818 #9839
  edge: ["ie"],

  // The webapp package converts browser names to camel case, so
  // mobile_safari and mobileSafari should be synonymous.
  mobile_safari: ["mobileSafari"],
};

// Expand the given minimum versions by reusing chrome versions for
// chromeMobile (according to browserAliases above).
function applyAliases(versions) {
  Object.keys(browserAliases).forEach(original => {
    if (hasOwn.call(versions, original)) {
      browserAliases[original].forEach(alias => {
        if (! hasOwn.call(versions, alias)) {
          versions[alias] = versions[original];
        }
      });
    }
  });

  return versions;
}

// TODO Should it be possible for callers to setMinimumBrowserVersions to
// forbid any version of a particular browser?

// Given a { name, major, minor, patch } object like the one provided by
// webapp via request.browser, return true if that browser qualifies as
// "modern" according to all requested version constraints.
function isModern(browser) {
  return browser &&
    typeof browser.name === "string" &&
    hasOwn.call(minimumVersions, browser.name) &&
    greaterThanOrEqualTo([
      ~~browser.major,
      ~~browser.minor,
      ~~browser.patch,
    ], minimumVersions[browser.name].version);
}

// Any package that depends on the modern-browsers package can call this
// function to communicate its expectations for the minimum browser
// versions that qualify as "modern." The final decision between
// web.browser.legacy and web.browser will be based on the maximum of all
// requested minimum versions for each browser.
function setMinimumBrowserVersions(versions, source) {
  applyAliases(versions);

  Object.keys(versions).forEach(browserName => {
    if (hasOwn.call(minimumVersions, browserName) &&
        ! greaterThan(versions[browserName],
                      minimumVersions[browserName].version)) {
      return;
    }

    minimumVersions[browserName] = {
      version: copy(versions[browserName]),
      source: source || getCaller("setMinimumBrowserVersions")
    };
  });
}

function getCaller(calleeName) {
  const error = new Error;
  Error.captureStackTrace(error);
  const lines = error.stack.split("\n");
  let caller;
  lines.some((line, i) => {
    if (line.indexOf(calleeName) >= 0) {
      caller = lines[i + 1].trim();
      return true;
    }
  });
  return caller;
}

Object.assign(exports, {
  isModern,
  setMinimumBrowserVersions,
});

// For making defensive copies of [major, minor, ...] version arrays, so
// they don't change unexpectedly.
function copy(version) {
  if (typeof version === "number") {
    return version;
  }

  if (Array.isArray(version)) {
    return version.map(copy);
  }

  return version;
}

function greaterThanOrEqualTo(a, b) {
  return ! greaterThan(b, a);
}

function greaterThan(a, b) {
  const as = (typeof a === "number") ? [a] : a;
  const bs = (typeof b === "number") ? [b] : b;
  const maxLen = Math.max(as.length, bs.length);

  for (let i = 0; i < maxLen; ++i) {
    a = (i < as.length) ? as[i] : 0;
    b = (i < bs.length) ? bs[i] : 0;

    if (a > b) {
      return true;
    }

    if (a < b) {
      return false;
    }
  }

  return false;
}

function makeSource(feature) {
  return module.id + " (" + feature + ")"
}

setMinimumBrowserVersions({
  chrome: 49,
  edge: 12,
  firefox: 45,
  mobileSafari: [9, 2],
  opera: 36,
  safari: 9,
  // Electron 1.0.0+ matches Chromium 49, per
  // https://github.com/Kilian/electron-to-chromium/blob/master/full-versions.js
  electron: 1,
}, makeSource("classes"));

setMinimumBrowserVersions({
  chrome: 39,
  edge: 13,
  firefox: 26,
  mobileSafari: 10,
  opera: 26,
  safari: 10,
  // Disallow any version of PhantomJS.
  phantomjs: Infinity,
  electron: [0, 20],
}, makeSource("generator functions"));

setMinimumBrowserVersions({
  chrome: 41,
  edge: 13,
  firefox: 34,
  mobileSafari: [9, 2],
  opera: 29,
  safari: [9, 1],
  electron: [0, 24],
}, makeSource("template literals"));

setMinimumBrowserVersions({
  chrome: 38,
  edge: 12,
  firefox: 36,
  mobileSafari: 9,
  opera: 25,
  safari: 9,
  electron: [0, 20],
}, makeSource("symbols"));

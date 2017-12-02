const minimumVersions = Object.create(null);
const hasOwn = Object.prototype.hasOwnProperty;

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
    ], minimumVersions[browser.name]);
}

// Any package that depends on the modern-browsers package can call this
// function to communicate its expectations for the minimum browser
// versions that qualify as "modern." The final decision between
// web.browser.legacy and web.browser will be based on the maximum of all
// requested minimum versions for each browser.
function setMinimumBrowserVersions(versions) {
  Object.keys(versions).forEach(browserName => {
    const newMinVersion = versions[browserName];
    if (hasOwn.call(minimumVersions, browserName)) {
      if (greaterThan(newMinVersion, minimumVersions[browserName])) {
        minimumVersions[browserName] = copy(newMinVersion);
      }
    } else {
      minimumVersions[browserName] = copy(newMinVersion);
    }
  });
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

// ECMAScript 2015 Classes
setMinimumBrowserVersions({
  chrome: 49,
  edge: 12,
  firefox: 45,
  mobile_safari: [9, 2],
  opera: 36,
  safari: 9,
});

// ECMAScript 2015 Generator Functions
setMinimumBrowserVersions({
  chrome: 39,
  edge: 13,
  firefox: 26,
  mobile_safari: 10,
  opera: 26,
  safari: 10,
  // Disallow any version of PhantomJS.
  phantomjs: Infinity,
});

// ECMAScript 2015 Template Literals
setMinimumBrowserVersions({
  chrome: 41,
  edge: 13,
  firefox: 34,
  mobile_safari: [9, 2],
  opera: 29,
  safari: [9, 1],
});

// ECMAScript 2015 Symbols
setMinimumBrowserVersions({
  chrome: 38,
  edge: 12,
  firefox: 36,
  mobile_safari: 9,
  opera: 25,
  safari: 9,
});

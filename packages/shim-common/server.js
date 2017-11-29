"use strict";

export const hasOwn = Object.prototype.hasOwnProperty;

export function doNotNeedShim(
  // The HTTP request object, as exposed (for example) by sink.request.
  request,
  // Map from lowercase browser names to the minimum major version of that
  // browser that no longer needs the shim.
  minimumMajorVersions = {},
  // Optional URL query parameter that can be used to force the shim to be
  // injected into the HTTP response.
  queryForceParam,
) {
  const { browser, url } = request;

  if (queryForceParam) {
    const query = url && url.query;
    const forced = query && query[queryForceParam];
    if (forced) {
      return false;
    }
  }

  if (browser &&
      hasOwn.call(minimumMajorVersions, browser.name) &&
      browser.major >= minimumMajorVersions[browser.name]) {
    return true;
  }

  return false;
}

export function makeScript(packagePath) {
  return '\n<script src="/packages/' + packagePath + (
    Meteor.isProduction ? ".min.js" : ".js"
  ) + '"></script>';
}

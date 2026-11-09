/**
 * @summary Wrapper around the standard `fetch` API. Packages can extend
 * this function to add middleware-like behavior (e.g. authentication).
 * On environments without a native `fetch` (e.g. the `web.browser.legacy`
 * arch), the call rejects with a clear error unless the `fetch` package
 * is installed to provide the polyfill.
 * @locus Anywhere
 * @param {string|Request} url - The URL to fetch or a Request object
 * @param {Object} [options] - Standard fetch options
 * @returns {Promise<Response>} - The fetch response
 */
Meteor.fetch = function (url, options) {
  if (typeof globalThis.fetch !== 'function') {
    return Promise.reject(new Error(
      'Meteor.fetch: native fetch is not available in this environment. ' +
      'Add the "fetch" package to polyfill it on legacy clients.'
    ));
  }
  return globalThis.fetch(url, options);
};

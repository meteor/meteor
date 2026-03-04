/**
 * @summary Wrapper around the standard `fetch` API. Packages can extend
 * this function to add middleware-like behavior (e.g. authentication).
 * @locus Anywhere
 * @param {string|Request} url - The URL to fetch or a Request object
 * @param {Object} [options] - Standard fetch options
 * @returns {Promise<Response>} - The fetch response
 */
Meteor.fetch = function (url, options) {
  return fetch(url, options);
};

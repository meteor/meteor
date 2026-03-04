import { Accounts } from 'meteor/accounts-base';

/**
 * @summary Make an authenticated HTTP request. Automatically includes
 * the user's login token in the Authorization header.
 * @locus Client
 * @param {string|Request} url - The URL to fetch or a Request object
 * @param {Object} [options] - Standard fetch options plus:
 * @param {boolean} [options.auth=true] - Set to false to skip auth header
 * @returns {Promise<Response>} - The fetch response
 */
export const meteorFetch = async (url, options = {}) => {
  const { auth = true, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers || {});

  if (auth) {
    const token = Accounts._storedLoginToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return fetch(url, { ...fetchOptions, headers });
};

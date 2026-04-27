import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';

/**
 * @summary Extends Meteor.fetch with authentication. Automatically
 * includes the user's login token in the Authorization header.
 * @locus Client
 * @param {Function} originalFetch - The base Meteor.fetch to wrap
 * @returns {Function} Enhanced fetch function with auth support
 */
export function createAuthFetch(originalFetch) {
  return async function (url, options = {}) {
    const { auth = true, ...fetchOptions } = options;

    const headers = new Headers(fetchOptions.headers || {});

    if (auth) {
      const token = Accounts._storedLoginToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      // When HttpOnly cookies are enabled, include credentials so the
      // browser sends the meteor_login_token cookie automatically.
      // This covers the case where the in-memory token is unavailable
      // (e.g. after page reload with clientStorage: 'none').
      if (Accounts._useHttpOnlyCookies && !fetchOptions.credentials) {
        fetchOptions.credentials = 'include';
      }
    }

    return originalFetch(url, { ...fetchOptions, headers });
  };
}

import { _CurrentEndpointInvocation } from 'meteor/accounts-base';

/**
 * @summary Extends Meteor.fetch with authentication. Automatically
 * includes the login token from the current endpoint invocation
 * context, or uses an explicitly provided token.
 * @locus Server
 * @param {Function} originalFetch - The base Meteor.fetch to wrap
 * @returns {Function} Enhanced fetch function with auth support
 */
export function createAuthFetch(originalFetch) {
  return async function (url, options = {}) {
    const { auth = true, token: explicitToken, ...fetchOptions } = options;

    const headers = new Headers(fetchOptions.headers || {});

    if (auth) {
      let token = explicitToken;

      if (!token) {
        const invocation = _CurrentEndpointInvocation.get();
        if (invocation?.loginToken) {
          token = invocation.loginToken;
        }
      }

      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    return originalFetch(url, { ...fetchOptions, headers });
  };
}

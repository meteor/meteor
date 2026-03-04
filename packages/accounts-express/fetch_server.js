import { _CurrentEndpointInvocation } from 'meteor/accounts-base';

/**
 * @summary Make an authenticated HTTP request from the server.
 * Automatically includes the login token from the current endpoint
 * invocation context, or uses an explicitly provided token.
 * @locus Server
 * @param {string|Request} url - The URL to fetch or a Request object
 * @param {Object} [options] - Standard fetch options plus:
 * @param {boolean} [options.auth=true] - Set to false to skip auth header
 * @param {string} [options.token] - Explicit token to use. If omitted,
 *   attempts to use the token from the current endpoint invocation context.
 * @returns {Promise<Response>} - The fetch response
 */
export const meteorFetch = async (url, options = {}) => {
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

  return fetch(url, { ...fetchOptions, headers });
};

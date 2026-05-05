import { Accounts } from "meteor/accounts-base";

/**
 * @summary Wraps Meteor.fetch with opt-in authentication. Auth is off by
 * default; pass `auth: true` to attach the user's login token. For an
 * auth-on-by-default ergonomic, import `fetch` from `meteor/accounts-express`.
 * @locus Client
 * @param {Function} originalFetch - The base Meteor.fetch to wrap
 * @returns {Function} Enhanced fetch function with auth support
 */
export function createAuthFetch(originalFetch) {
  return async function (url, options = {}) {
    // `token` is server-only on the client; strip it so it doesn't leak
    // into the underlying fetch call.
    const { auth = false, token: _ignoredToken, ...fetchOptions } = options;

    const headers = new Headers(fetchOptions.headers || {});

    if (auth) {
      const token = Accounts._storedLoginToken();
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      // When HttpOnly cookies are enabled, include credentials so the
      // browser sends the meteor_login_token cookie automatically.
      // This covers the case where the in-memory token is unavailable
      // (e.g. after page reload with clientStorage: 'none').
      if (Accounts._useHttpOnlyCookies && !fetchOptions.credentials) {
        fetchOptions.credentials = "include";
      }
    }

    return originalFetch(url, { ...fetchOptions, headers });
  };
}

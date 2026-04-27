import { Meteor } from 'meteor/meteor';
import { _CurrentEndpointInvocation } from 'meteor/accounts-base';

function isSameOriginAsApp(url) {
  try {
    const target = new URL(typeof url === 'string' ? url : url.url);
    const root = new URL(Meteor.absoluteUrl());
    return target.origin === root.origin;
  } catch {
    return false;
  }
}

/**
 * @summary Wraps Meteor.fetch with opt-in authentication. Auth is off by
 * default; pass `auth: true` to attach the login token from the current
 * endpoint invocation context (same-origin only), or `token: '...'` to
 * supply an explicit token. Passing `token` is itself an opt-in: it
 * implies `auth: true` unless `auth: false` is also set. For an
 * auth-on-by-default ergonomic, import `fetch` from `meteor/accounts-express`.
 * @locus Server
 * @param {Function} originalFetch - The base Meteor.fetch to wrap
 * @returns {Function} Enhanced fetch function with auth support
 */
export function createAuthFetch(originalFetch) {
  return async function (url, options = {}) {
    const { auth: authOpt, token: explicitToken, ...fetchOptions } = options;
    // Token presence is itself an opt-in signal. Only when `auth` is
    // explicitly set does it override that.
    const auth = authOpt ?? (explicitToken !== undefined);

    const headers = new Headers(fetchOptions.headers || {});

    if (auth) {
      let token = explicitToken;

      // Implicit-from-context tokens are only forwarded when the target
      // is same-origin with the app, so a handler that fetches a
      // third-party host doesn't hand it the user's loginToken.
      if (!token && isSameOriginAsApp(url)) {
        const invocation = _CurrentEndpointInvocation.get();
        if (invocation?.loginToken) {
          token = invocation.loginToken;
        }
      }

      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    return originalFetch(url, { ...fetchOptions, headers });
  };
}

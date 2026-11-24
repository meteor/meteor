import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";

// Auth tokens may go only to the page, ROOT_URL, or configured API origins.
function trustedRoots() {
  const roots = [window.location.href];
  try {
    roots.push(Meteor.absoluteUrl());
  } catch {
    // Keep the page origin when ROOT_URL is unavailable.
  }
  const allowed = Meteor.settings?.public?.packages?.["accounts-express"]?.authFetchAllowedOrigins;
  return Array.isArray(allowed) ? roots.concat(allowed) : roots;
}

function isTrustedOrigin(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return trustedRoots().some((root) => {
    try {
      return url.origin === new URL(root).origin;
    } catch {
      return false;
    }
  });
}

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

    // Let Fetch normalize Request/URL/string inputs once, including inherited
    // Request headers and bodies. Authenticate the same request we send.
    const request = auth ? new Request(url, fetchOptions) : null;
    const headers = new Headers(request ? request.headers : fetchOptions.headers || {});
    // The Request owns the encoded body (and its multipart boundary). Passing
    // the original body again would encode FormData a second time.
    if (request) delete fetchOptions.body;

    if (auth) {
      const target = new URL(request.url, document.baseURI || window.location.href);
      // whatwg-fetch retains relative URLs, unlike native Request. Pin its
      // destination before reading application state or calling the transport.
      if (request.url !== target.href) request.url = target.href;
      if (!isTrustedOrigin(target)) {
        return originalFetch(request, { ...fetchOptions, headers });
      }

      const token = Accounts._storedLoginToken();
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      // When HttpOnly cookies are enabled, include credentials so the
      // browser sends the meteor_login_token cookie automatically.
      // This covers the case where the in-memory token is unavailable
      // (e.g. after page reload with clientStorage: 'none').
      if (
        Accounts._useHttpOnlyCookies &&
        !fetchOptions.credentials &&
        request.credentials !== "omit"
      ) {
        fetchOptions.credentials = "include";
      }
    }

    return originalFetch(request || url, { ...fetchOptions, headers });
  };
}

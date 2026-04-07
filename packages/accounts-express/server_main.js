import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { createWebAppAuthMiddleware } from './create_auth_middleware.js';
import { createAuthFetch } from './fetch_server.js';

/**
 * @summary Create Express middleware that authenticates requests using
 * Meteor login tokens. Tokens can be provided via the Authorization
 * Bearer header or the meteor_login_token cookie.
 * @locus Server
 * @param {Object} [options]
 * @param {boolean} [options.required=false] - Whether authentication is
 *   required (returns 401 for unauthenticated) or optional (sets userId
 *   to null).
 * @returns {Function} Express middleware function
 */
function createAuthMiddleware(options = {}) {
  return createWebAppAuthMiddleware({
    ...options,
    hashLoginTokenFn: Accounts._hashLoginToken,
  });
}

// Wrap the base Meteor.fetch with auth functionality
Meteor.fetch = createAuthFetch(Meteor.fetch);

/**
 * @summary Handle fetch calls from the meteor/fetch package when auth
 * options are present. Falls back to rawFetch when no auth is needed.
 * @locus Server
 * @param {string|Request} url
 * @param {Object} [options]
 * @param {Function} rawFetch - The underlying fetch implementation
 * @returns {Promise<Response>|null} Response if handled, null to fall through
 */
function handleFetch(url, options, rawFetch = Meteor.fetch) {
  if (options && ('auth' in options || 'token' in options)) {
    return Meteor.fetch(url, options);
  }
  return rawFetch(url, options);
}

export { createAuthMiddleware, createAuthFetch, handleFetch };

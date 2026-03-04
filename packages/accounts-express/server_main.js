import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { createWebAppAuthMiddleware } from './create_auth_middleware.js';
import { meteorFetch } from './fetch_server.js';

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
Accounts.createAuthMiddleware = function (options = {}) {
  return createWebAppAuthMiddleware({
    ...options,
    hashLoginTokenFn: this._hashLoginToken,
  });
};

Meteor.fetch = meteorFetch;

export { createWebAppAuthMiddleware, meteorFetch };

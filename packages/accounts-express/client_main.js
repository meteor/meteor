import { Meteor } from 'meteor/meteor';
import { createAuthFetch } from './fetch_client.js';

// Wrap the base Meteor.fetch with auth functionality
Meteor.fetch = createAuthFetch(Meteor.fetch);

/**
 * @summary Handle fetch calls from the meteor/fetch package when auth
 * options are present. Falls back to rawFetch when no auth is needed.
 * @locus Client
 * @param {string|Request} url
 * @param {Object} [options]
 * @param {Function} rawFetch - The underlying fetch implementation
 * @returns {Promise<Response>|null} Response if handled, null to fall through
 */
function handleFetch(url, options, rawFetch = Meteor.fetch) {
  if (options && options.auth !== undefined) {
    return Meteor.fetch(url, options);
  }
  return rawFetch(url, options);
}

export { createAuthFetch, handleFetch };

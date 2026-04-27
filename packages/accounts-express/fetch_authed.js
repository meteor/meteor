import { Meteor } from 'meteor/meteor';

/**
 * @summary Auth-on-by-default fetch. Thin wrapper around Meteor.fetch that
 * sets `auth: true` unless overridden. Pass `auth: false` to opt out, or
 * `token: '...'` (server only) to use an explicit token.
 * @locus Anywhere
 * @param {string|Request} url
 * @param {Object} [options]
 * @returns {Promise<Response>}
 */
export function fetch(url, options = {}) {
  const { auth = true, ...rest } = options;
  return Meteor.fetch(url, { ...rest, auth });
}

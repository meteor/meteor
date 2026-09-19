import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';

// Labels are shown in key lists and passed to change listeners.
const MAX_CREDENTIAL_NAME_LENGTH = 100;

/**
 * A non-empty label for a key of at most 100 characters.
 */
export const credentialNamePattern = Match.Where(name => {
  check(name, Match.NonEmptyString);
  return name.length <= MAX_CREDENTIAL_NAME_LENGTH;
});

/**
 * The guard shared by methods that act on the logged-in user's keys.
 * @param {Object} invocation The method invocation (`this`).
 * @returns {String} The logged-in user's id.
 * @throws {Meteor.Error} `no-logged-user`
 */
export const requireUserId = invocation => {
  if (!invocation.userId) {
    throw new Meteor.Error('no-logged-user', 'No user logged in.');
  }
  return invocation.userId;
};

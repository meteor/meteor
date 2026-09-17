import { Meteor } from 'meteor/meteor';

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

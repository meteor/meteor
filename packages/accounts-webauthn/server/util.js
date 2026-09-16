import { Meteor } from 'meteor/meteor';

// Methods that act on the logged-in user's keys share this guard.
export const requireUserId = invocation => {
  if (!invocation.userId) {
    throw new Meteor.Error('no-logged-user', 'No user logged in.');
  }
  return invocation.userId;
};

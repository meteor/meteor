import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

const defaultValidateNewUserHooks = Accounts._validateNewUserHooks.slice();
let loginAttemptUnsubscribe = null;

export function resetHooks() {
  Accounts._validateNewUserHooks.length = 0;
  defaultValidateNewUserHooks.forEach((h) => Accounts._validateNewUserHooks.push(h));
  Accounts._onCreateUserHook = undefined;
  if (loginAttemptUnsubscribe) {
    loginAttemptUnsubscribe.stop?.();
    loginAttemptUnsubscribe = null;
  }
}

export function applyHooks(hooks) {
  if (hooks.validateNewUser === 'reject') {
    Accounts.validateNewUser(() => {
      throw new Meteor.Error('rejected-by-validator', 'Rejected by validator');
    });
  }
  if (hooks.onCreateUserAddsField) {
    Accounts.onCreateUser((options, user) => ({
      ...user,
      profile: { ...(user.profile || {}), e2eMarker: true },
    }));
  }
  if (hooks.validateLoginAttempt === 'reject') {
    loginAttemptUnsubscribe = Accounts.validateLoginAttempt(() => {
      throw new Meteor.Error('login-rejected', 'Login rejected by validator');
    });
  }
}

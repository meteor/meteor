import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    /**
     * Log the user in with a password and an authenticator-app 2FA code.
     * Selector may be a string (username or email, depending on `@`) or an object.
     */
    function loginWithPasswordAnd2faCode(
      selector: { username: string } | { email: string } | { id: string } | string,
      password: string,
      code: string,
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

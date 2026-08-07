import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    function loginWithFacebook(
      options?: Meteor.LoginWithExternalServiceOptions,
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

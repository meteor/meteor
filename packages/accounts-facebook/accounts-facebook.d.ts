import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    // callback-first call shape: loginWithFacebook(callback)
    function loginWithFacebook(
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
    function loginWithFacebook(
      options?: Meteor.LoginWithExternalServiceOptions,
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

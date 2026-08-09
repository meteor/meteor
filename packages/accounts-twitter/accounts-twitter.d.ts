import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    // callback-first call shape: loginWithTwitter(callback)
    function loginWithTwitter(
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
    function loginWithTwitter(
      options?: Meteor.LoginWithExternalServiceOptions,
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

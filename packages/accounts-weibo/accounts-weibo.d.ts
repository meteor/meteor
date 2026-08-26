import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    // callback-first call shape: loginWithWeibo(callback)
    function loginWithWeibo(
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
    function loginWithWeibo(
      options?: Meteor.LoginWithExternalServiceOptions,
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

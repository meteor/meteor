import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    // callback-first call shape: loginWithMeteorDeveloperAccount(callback)
    function loginWithMeteorDeveloperAccount(
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
    function loginWithMeteorDeveloperAccount(
      options?: Meteor.LoginWithExternalServiceOptions,
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

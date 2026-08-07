import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    function loginWithMeteorDeveloperAccount(
      options?: Meteor.LoginWithExternalServiceOptions,
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

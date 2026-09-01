import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    // callback-first call shape: loginWithGithub(callback)
    function loginWithGithub(
      callback?: (error?: globalThis.Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
    function loginWithGithub(
      options?: Meteor.LoginWithExternalServiceOptions,
      callback?: (error?: globalThis.Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

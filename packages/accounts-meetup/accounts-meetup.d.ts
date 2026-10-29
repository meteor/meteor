import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    // callback-first call shape: loginWithMeetup(callback)
    function loginWithMeetup(
      callback?: (error?: globalThis.Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
    function loginWithMeetup(
      options?: Meteor.LoginWithExternalServiceOptions,
      callback?: (error?: globalThis.Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

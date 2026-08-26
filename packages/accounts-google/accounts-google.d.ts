import { Meteor } from 'meteor/meteor';

declare module 'meteor/meteor' {
  namespace Meteor {
    // callback-first call shape: loginWithGoogle(callback)
    function loginWithGoogle(
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
    function loginWithGoogle(
      options?: Meteor.LoginWithExternalServiceOptions & {
        /** Google login accepts additional login parameters based on
         * https://developers.google.com/identity/openid-connect/openid-connect#authenticationuriparameters.
         * However, there's only one parameter that must be set directly; all
         * others can be set using Meteor's standard OAuth login parameters */
        loginUrlParameters?: {
          include_granted_scopes?: boolean;
          [key: string]: unknown;
        };
      },
      callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
    ): void;
  }
}

export {};

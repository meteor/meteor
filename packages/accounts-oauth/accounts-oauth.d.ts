import { Accounts } from 'meteor/accounts-base';

declare module 'meteor/accounts-base' {
  namespace Accounts {
    /** OAuth service registry contributed by the accounts-oauth package. */
    var oauth: {
      /** Register an OAuth login service by name. */
      registerService(name: string): void;
      /** Remove a previously registered OAuth service. */
      unregisterService(name: string): void;
      /** Names of all currently registered OAuth services. */
      serviceNames(): string[];
      /** Poll for the credential secret after the popup closes, then log in. */
      tryLoginAfterPopupClosed(
        credentialToken: string,
        callback?: (error?: Error) => void,
        timeout?: number
      ): void;
      /** Build a handler for the popup credential-request-complete callback. */
      credentialRequestCompleteHandler(
        callback?: (error?: Error) => void
      ): (credentialTokenOrError: string | Error) => void;
    };

    /** Error thrown for invalid service configuration (service-configuration). */
    var ConfigError: ErrorConstructor;
  }
}

export {};

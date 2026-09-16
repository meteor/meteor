import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

declare module 'meteor/meteor' {
  namespace Meteor {
    /** Log the user in with a one-time passwordless token. */
    function passwordlessLoginWithToken(
      selector: object | string,
      token: string,
      callback?: (error?: Error) => void
    ): void;
    /** Log in with a one-time token plus an authenticator-app 2FA code. */
    function passwordlessLoginWithTokenAnd2faCode(
      selector: object | string,
      token: string,
      code: string,
      callback?: (error?: Error) => void
    ): void;
  }
}

declare module 'meteor/accounts-base' {
  namespace Accounts {
    /** Request a one-time login token for a user (creates the user if needed). */
    function requestLoginTokenForUser(
      options: { selector: string | object; userData?: unknown; options?: object },
      callback?: (error?: Error) => void
    ): void;
    /** Attempt to log in automatically from a token in the URL/localStorage. */
    function autoLoginWithToken(): void;
    /** Send the login-token email (server). */
    function sendLoginTokenEmail(options: {
      userId: string;
      sequence: string;
      email: string;
      extra?: Record<string, unknown>;
    }): Promise<{
      email: string;
      user: unknown;
      token: string;
      url: string;
      options: unknown;
    }>;
  }
}

export {};

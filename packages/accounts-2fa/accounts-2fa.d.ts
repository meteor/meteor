import { Meteor } from 'meteor/meteor';

export interface TwoFactorActivationData {
  svg: string;
  secret: string;
  uri: string;
}

/** Options accepted by `Accounts.configure2fa`. */
export interface TwoFactorConfigureOptions {
  /** TOTP steps accepted on each side of the current step (default 10). */
  window?: number;
  /** Reject a step at or before the last accepted one (default true). */
  preventReplay?: boolean;
  /** Login attempt types that get replay protection. Replaces the default `['password', 'passwordless']`. */
  loginTypes?: string[];
}

declare module 'meteor/accounts-base' {
  namespace Accounts {
    /**
     * Check whether the logged-in user has 2FA enabled.
     * The callback receives a boolean on success, or a single Error on failure.
     */
    function has2faEnabled(callback: (error: Error | undefined, enabled?: boolean) => void): void;

    /**
     * Generate an activation QR code (SVG) plus secret and URI for setting up 2FA.
     * @param appName Application name shown inside the authenticator app.
     */
    function generate2faActivationQrCode(
      appName: string,
      callback: (error: Error | undefined, data?: TwoFactorActivationData) => void
    ): void;

    /**
     * Enable 2FA for the logged-in user using a code from the authenticator.
     */
    function enableUser2fa(code: string, callback?: (error?: Error) => void): void;

    /**
     * Disable 2FA for the logged-in user.
     */
    function disableUser2fa(callback?: (error?: Error) => void): void;

    /** Configure TOTP verification and replay protection (server only). */
    function configure2fa(options: TwoFactorConfigureOptions): void;

    /** Returns true if the user document has an active `services.twoFactorAuthentication`. */
    function _check2faEnabled(user: Meteor.User): boolean;

    /** Server-side check against the currently logged-in user. */
    function _is2faEnabledForUser(): Promise<boolean>;

    /** Generate an OTP token for the given secret, at `timestamp` (ms) when given. */
    function _generate2faToken(secret: string, timestamp?: number): { token: string };

    /** Verify an OTP code and return its time step, or null when invalid (server only). */
    function _verify2faToken(secret: string, code: string): number | null;

    /** Verify an OTP code against a secret (server only). */
    function _isTokenValid(secret: string, code: string): boolean;
  }
}

export {};

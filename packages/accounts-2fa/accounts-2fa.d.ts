import { Meteor } from 'meteor/meteor';

export interface TwoFactorActivationData {
  svg: string;
  secret: string;
  uri: string;
}

/**
 * Payload passed to `Accounts.validate2faChange` callbacks.
 * `stage` is only set for an activation: `setup` when a secret is about to be
 * issued, `confirm` when 2FA is about to be turned on.
 */
export interface TwoFactorChangeAttempt {
  type: 'activation' | 'deactivation';
  stage?: 'setup' | 'confirm';
  /** Same shape as `Meteor.user()`, so it respects `defaultFieldSelector`. */
  user: Meteor.User;
  connection: Meteor.Connection | null;
}

/** Email second factor options. Disabled until `enabled` is true. */
export interface TwoFactorEmailOptions {
  enabled?: boolean;
  /** Let a user who already has TOTP choose email (default false). */
  offerToOtpUsers?: boolean;
  /** Send codes only to a verified address (default true). */
  requireVerified?: boolean;
  /** Code lifetime in milliseconds (default 600 000). */
  expirationMs?: number;
  /** Wrong codes accepted before the code is discarded (default 5). */
  maxAttempts?: number;
  /** Minimum delay between two sends, in milliseconds (default 60 000). */
  resendCooldownMs?: number;
  /** Server secret for the email-code HMAC. Without it, codes are hashed with SHA-256 and a warning is logged. */
  hashSecret?: string | null;
}

/** Options accepted by `Accounts.configure2fa`. */
export interface TwoFactorConfigureOptions {
  email?: TwoFactorEmailOptions;
}

/** Payload passed to `Accounts.on2faVerified` and `Accounts.validate2faChallenge` callbacks. */
export interface TwoFactorFactorEvent {
  user: Meteor.User;
  connection: Meteor.Connection | null;
  method: 'otp' | 'email';
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

    /**
     * Refuse a 2FA activation or deactivation (server only).
     * Throw a `Meteor.Error` from the callback to refuse the change and report
     * the reason to the user. Any other exception reaches the client as a 500.
     */
    function validate2faChange(
      callback: (attempt: TwoFactorChangeAttempt) => void | Promise<void>
    ): { stop: () => void };

    /** Configure the second factors offered at login (server only). */
    function configure2fa(options: TwoFactorConfigureOptions): void;

    /**
     * Called after a login that presented a second factor was allowed (server only).
     * A thrown error is logged and ignored.
     */
    function on2faVerified(
      callback: (event: TwoFactorFactorEvent) => void | Promise<void>
    ): { stop: () => void };

    /**
     * Called before an email code is sent (server only).
     * Throw to skip the send. The login fails with that error.
     */
    function validate2faChallenge(
      callback: (event: TwoFactorFactorEvent) => void | Promise<void>
    ): { stop: () => void };

    /**
     * Provide string data sent with every login, such as a trusted-browser token (client only).
     */
    function set2faContextProvider(
      provider: () => Record<string, string> | null | undefined
    ): void;

    /**
     * Ask the server to email a second-factor code after checking the password (client only).
     * The callback receives the `no-2fa-code` error when the message was sent or is on cooldown.
     */
    function request2faEmailCode(
      selector: string | { username: string } | { email: string } | { id: string },
      password: string,
      callback?: (error?: Error | Meteor.Error) => void
    ): void;

    /** Returns true if the user document has an active `services.twoFactorAuthentication`. */
    function _check2faEnabled(user: Meteor.User): boolean;

    /** Server-side check against the currently logged-in user. */
    function _is2faEnabledForUser(): Promise<boolean>;

    /** Generate an OTP token for the given secret. */
    function _generate2faToken(secret: string): { token: string };

    /** Verify an OTP code against a secret (server only). */
    function _isTokenValid(secret: string, code: string): boolean;
  }
}

export {};

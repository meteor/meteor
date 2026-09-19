import { Meteor } from 'meteor/meteor';

/** A registered security key or passkey, as returned to the client. */
export interface WebAuthnCredentialInfo {
  id: string;
  name: string;
  transports?: string[] | undefined;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  aaguid: string;
  /** Registered with user verification, so usable for passwordless login. */
  userVerified: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** Summary of a verified registration passed to `Accounts.validateWebAuthnRegistration`. */
export interface WebAuthnRegistrationInfo {
  credentialId: string;
  aaguid: string;
  fmt: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  userVerified: boolean;
  transports: string[];
}

/** Where a registration comes from: an existing user or a new sign-up. */
export interface WebAuthnRegistrationContext {
  userId: string | null;
  mode: 'addCredential' | 'signup';
}

export interface CreateUserWithWebAuthnOptions {
  username?: string | undefined;
  email?: string | undefined;
  profile?: Record<string, unknown> | undefined;
  credentialName?: string | undefined;
}

/** A username, an email, or an object with exactly one of `id`, `username` or `email`. */
export type WebAuthnSelector =
  | string
  | { id: string; username?: never; email?: never }
  | { username: string; id?: never; email?: never }
  | { email: string; id?: never; username?: never };

/** Node-style callback: an error on failure, otherwise the result. */
export type WebAuthnCallback<T = void> = (error?: Error, result?: T) => void;

export type WebAuthnLoginCallback = WebAuthnCallback<Meteor.LoginMethodResult>;

/** A change to the keys of a user, passed to `Accounts.onWebAuthnCredentialChange`. */
export interface WebAuthnCredentialChange {
  userId: string;
  action: 'added' | 'renamed' | 'removed';
  credential: WebAuthnCredentialInfo;
}

export type WebAuthnRegistrationValidator = (
  info: WebAuthnRegistrationInfo,
  context: WebAuthnRegistrationContext,
  registrationInfo: unknown
) => boolean | void | Promise<boolean | void>;

declare module 'meteor/meteor' {
  namespace Meteor {
    /** Log in with a security key or passkey; without a selector the key identifies the account. */
    function loginWithWebAuthn(callback?: WebAuthnLoginCallback): void;
    function loginWithWebAuthn(
      selector: WebAuthnSelector,
      callback?: WebAuthnLoginCallback
    ): void;
    function loginWithWebAuthnAsync(
      selector?: WebAuthnSelector
    ): Promise<Meteor.LoginMethodResult>;

    /** Log in with a password and a security key (second-factor mode). */
    function loginWithPasswordAndWebAuthn(
      selector: WebAuthnSelector,
      password: string,
      callback?: WebAuthnLoginCallback
    ): void;
    function loginWithPasswordAndWebAuthnAsync(
      selector: WebAuthnSelector,
      password: string
    ): Promise<Meteor.LoginMethodResult>;

    /** Log in with a one-time token and a security key (second-factor mode). */
    function passwordlessLoginWithTokenAndWebAuthn(
      selector: WebAuthnSelector,
      token: string,
      callback?: WebAuthnLoginCallback
    ): void;
    function passwordlessLoginWithTokenAndWebAuthnAsync(
      selector: WebAuthnSelector,
      token: string
    ): Promise<Meteor.LoginMethodResult>;
  }
}

declare module 'meteor/accounts-base' {
  namespace Accounts {
    /** Whether the current browser supports WebAuthn. */
    function isWebAuthnSupported(): boolean;
    /** Whether a platform authenticator (Touch ID, Windows Hello, ...) is available. */
    function isWebAuthnPlatformAuthenticatorAvailable(): Promise<boolean>;

    /** Register a security key or passkey for the logged-in user. */
    function registerWebAuthnCredential(
      options?: string | { name?: string | undefined },
      callback?: WebAuthnCallback<WebAuthnCredentialInfo>
    ): void;
    function registerWebAuthnCredential(
      callback: WebAuthnCallback<WebAuthnCredentialInfo>
    ): void;
    function registerWebAuthnCredentialAsync(
      options?: string | { name?: string | undefined }
    ): Promise<WebAuthnCredentialInfo>;

    /** List the security keys registered for the logged-in user. */
    function listWebAuthnCredentials(
      callback: WebAuthnCallback<WebAuthnCredentialInfo[]>
    ): void;
    function listWebAuthnCredentialsAsync(): Promise<WebAuthnCredentialInfo[]>;

    /** Rename a security key of the logged-in user. */
    function renameWebAuthnCredential(
      id: string,
      name: string,
      callback?: WebAuthnCallback
    ): void;
    function renameWebAuthnCredentialAsync(id: string, name: string): Promise<void>;

    /** Remove a security key from the logged-in user. */
    function removeWebAuthnCredential(id: string, callback?: WebAuthnCallback): void;
    function removeWebAuthnCredentialAsync(id: string): Promise<void>;

    /** Create a user whose only login method is a security key, and log them in. */
    function createUserWithWebAuthn(
      options: CreateUserWithWebAuthnOptions,
      callback?: WebAuthnLoginCallback
    ): void;
    function createUserWithWebAuthnAsync(
      options: CreateUserWithWebAuthnOptions
    ): Promise<Meteor.LoginMethodResult>;

    /** Require a security key whenever the logged-in user logs in. */
    function enableWebAuthnSecondFactor(callback?: WebAuthnCallback): void;
    function enableWebAuthnSecondFactorAsync(): Promise<void>;
    /** Stop requiring a security key when the logged-in user logs in. */
    function disableWebAuthnSecondFactor(callback?: WebAuthnCallback): void;
    function disableWebAuthnSecondFactorAsync(): Promise<void>;
    /** Whether the logged-in user must present a security key when logging in. */
    function hasWebAuthnSecondFactorEnabled(callback: WebAuthnCallback<boolean>): void;
    function hasWebAuthnSecondFactorEnabledAsync(): Promise<boolean>;

    /** Server: validate a registration before the credential is stored. */
    function validateWebAuthnRegistration(
      func: WebAuthnRegistrationValidator
    ): { stop: () => void };

    /** Server: run after a key was added, renamed or removed. */
    function onWebAuthnCredentialChange(
      func: (change: WebAuthnCredentialChange) => void | Promise<void>
    ): { stop: () => void };

    /** Server: true when the user requires a security key as a second factor. */
    function _checkWebAuthnSecondFactorEnabled(user: Meteor.User): boolean;
  }
}

export {};

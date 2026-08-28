import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Configuration } from 'meteor/service-configuration';
import { DDP } from 'meteor/ddp';

/**
 * Object containing functions that generate URLs for account-related emails.
 * Override these to customize URLs in password reset, enrollment, and verification emails.
 * URL methods can return either a string or a Promise that resolves to a string.
 */
export interface URLS {
  /** Generates the URL for password reset emails. Can return a Promise for async URL generation. */
  resetPassword: (token: string, extraParams?: Record<string, string>) => string | Promise<string>;
  /** Generates the URL for email verification emails. Can return a Promise for async URL generation. */
  verifyEmail: (token: string, extraParams?: Record<string, string>) => string | Promise<string>;
  /** Generates the URL for login token emails. Can return a Promise for async URL generation. */
  loginToken: (selector: string, token: string, extraParams?: Record<string, string>) => string | Promise<string>;
  /** Generates the URL for account enrollment emails. Can return a Promise for async URL generation. */
  enrollAccount: (token: string, extraParams?: Record<string, string>) => string | Promise<string>;
}

export interface EmailFields {
  from?: ((user: Meteor.User) => string) | undefined;
  subject?: ((user: Meteor.User) => string) | undefined;
  text?: ((user: Meteor.User, url: string) => string) | undefined;
  html?: ((user: Meteor.User, url: string) => string) | undefined;
}

export interface AccountsClientOptions {
  connection?: DDP.DDPStatic | undefined;
  ddpUrl?: string;
}

export class AccountsClient {
  constructor(options?: AccountsClientOptions);
  connection: DDP.DDPStatic;
}

export namespace Accounts {
  var urls: URLS;

  /**
   * Payload delivered to login hooks. Client hooks receive login method
   * details (or just an error), while server hooks receive a validated login
   * attempt, so environment-specific fields are optional.
   */
  interface LoginHookCallbackOptions {
    type?: string | undefined;
    allowed?: boolean | undefined;
    error?: Error | Meteor.Error | undefined;
    user?: Meteor.User | undefined;
    connection?: Meteor.Connection | undefined;
    methodName?: string | undefined;
    methodArguments?: unknown[] | undefined;
    id?: string | undefined;
    token?: string | undefined;
    tokenExpires?: Date | undefined;
  }

  /** Result of a resume or OAuth login attempt completed during page load. */
  interface PageLoadLoginAttemptInfo {
    type: string;
    allowed: boolean;
    error?: Error | Meteor.Error | undefined;
    methodName: string;
    methodArguments: unknown[];
  }

  function user(options?: {
    fields?: Mongo.FieldSpecifier | undefined
  }): Meteor.User | null;

  function userAsync(options?: {
    fields?: Mongo.FieldSpecifier | undefined;
  }): Promise<Meteor.User | null>;

  function userId(): string | null;

  function createUser(
    options: {
      username?: string | undefined;
      email?: string | undefined;
      password?: string | undefined;
      profile?: Meteor.UserProfile | undefined;
    },
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ): Promise<string>;

  function createUserAsync(
    options: {
      username?: string | undefined;
      email?: string | undefined;
      password?: string | undefined;
      profile?: Meteor.UserProfile | undefined;
    },
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ): Promise<string>;

  function createUserVerifyingEmail(
    options: {
      username?: string | undefined;
      email?: string | undefined;
      password?: string | undefined;
      profile?: Meteor.UserProfile | undefined;
    },
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ): Promise<string>;

  function config(options: {
    sendVerificationEmail?: boolean | undefined;
    forbidClientAccountCreation?: boolean | undefined;
    restrictCreationByEmailDomain?: string | ((email: string) => boolean) | undefined;
    loginExpiration?: number | undefined;
    loginExpirationInDays?: number | undefined;
    oauthSecretKey?: string | undefined;
    passwordResetTokenExpiration?: number | undefined;
    passwordResetTokenExpirationInDays?: number | undefined;
    passwordEnrollTokenExpiration?: number | undefined;
    passwordEnrollTokenExpirationInDays?: number | undefined;
    ambiguousErrorMessages?: boolean | undefined;
    bcryptRounds?: number | undefined;
    argon2Enabled?: string | boolean | undefined;
    argon2Type?: string | undefined;
    argon2TimeCost?: number | undefined;
    argon2MemoryCost?: number | undefined;
    argon2Parallelism?: number | undefined;
    defaultFieldSelector?: { [key: string]: 0 | 1 } | undefined;
    collection?: string | undefined;
    loginTokenExpirationHours?: number | undefined;
    tokenSequenceLength?: number | undefined;
  // Storage strategy for client tokens: 'local' (persist), 'session' (per-tab), or 'none' (in-memory only)
  clientStorage?: 'session' | 'local' | 'none';
  // Enable hybrid HttpOnly cookie + short-lived token flow
  useHttpOnlyCookies?: boolean | undefined;
  }): void;

  function onLogin(
    func: (attempt: LoginHookCallbackOptions) => void | Promise<void>
  ): {
    stop: () => void;
  };
  function onLogin(func: Function): { stop: () => void };

  function onLoginFailure(
    func: (attempt: LoginHookCallbackOptions) => void | Promise<void>
  ): {
    stop: () => void;
  };
  function onLoginFailure(func: Function): { stop: () => void };

  var loginServiceConfiguration: Mongo.Collection<Configuration>;

  function loginServicesConfigured(): boolean;

  function onPageLoadLogin(func: (attempt: PageLoadLoginAttemptInfo) => void): void;
  function onPageLoadLogin(func: Function): void;

  function loginWithTokenAsync(token: string): Promise<Meteor.LoginMethodResult>;
}

export namespace Accounts {
  function changePassword(
    oldPassword: string,
    newPassword: string,
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ):void;

  function forgotPassword(
    options: { email?: string | undefined },
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ):void;

  function resetPassword(
    token: string,
    newPassword: string,
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ):void;

  function verifyEmail(
    token: string,
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ):void;

  function onEmailVerificationLink(callback: (token: string, done: () => void) => void): void;
  function onEmailVerificationLink(callback: Function): void;

  function onEnrollmentLink(callback: (token: string, done: () => void) => void): void;
  function onEnrollmentLink(callback: Function): void;

  function onResetPasswordLink(callback: (token: string, done: () => void) => void): void;
  function onResetPasswordLink(callback: Function): void;

  function loggingIn(): boolean;

  function loggingOut(): boolean;

  function logout(
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ):void;

  function logoutAsync(): Promise<void>;

  function logoutAllClients(
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ):void;

  function logoutAllClientsAsync(): Promise<void>;

  function logoutOtherClients(
    callback?: (error?: Error | Meteor.Error | Meteor.TypedError) => void
  ):void;

  function logoutOtherClientsAsync(): Promise<void>;

  type PasswordSignupField =
    | 'USERNAME_AND_EMAIL' | 'USERNAME_AND_OPTIONAL_EMAIL' | 'USERNAME_ONLY' | 'EMAIL_ONLY';
  type PasswordlessSignupField = 'USERNAME_AND_EMAIL' | 'EMAIL_ONLY';

  var ui: {
    config(options: {
      requestPermissions?: Record<string, string[]> | undefined;
      requestOfflineToken?: Record<'google', boolean> | undefined;
      forceApprovalPrompt?: Record<'google', boolean> | undefined;
      passwordSignupFields?: PasswordSignupField | PasswordSignupField[] | undefined;
      passwordlessSignupFields?: PasswordlessSignupField | PasswordlessSignupField[] | undefined;
    }): void;
  };
}

export interface Header {
  [id: string]: string;
}

export interface EmailTemplates {
  from: string;
  siteName: string;
  headers?: Header | undefined;
  resetPassword: EmailFields;
  enrollAccount: EmailFields;
  verifyEmail: EmailFields;
}

export namespace Accounts {
  var emailTemplates: EmailTemplates;

  function addEmailAsync(userId: string, newEmail: string, verified?: boolean): Promise<void>;

  function removeEmail(userId: string, email: string): Promise<void>;

  function replaceEmailAsync(userId: string, oldEmail: string, newEmail: string, verified?: boolean): Promise<void>;

  type CreateUserCallback = (options: { profile?: {} | undefined }, user: Meteor.User) => Meteor.User | Promise<Meteor.User>;
  function onCreateUser(func: CreateUserCallback): void;
  function onCreateUser(func: Function
  ): void;

  function findUserByEmail(
    email: string,
    options?: { fields?: Mongo.FieldSpecifier | undefined }
  ): Promise<Meteor.User | null | undefined>;

  function findUserByUsername(
    username: string,
    options?: { fields?: Mongo.FieldSpecifier | undefined }
  ): Promise<Meteor.User | null | undefined>;

  interface SendEmailOptions {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    headers?: Header | undefined;
  }

  interface SendEmailResult {
    email: string;
    user: Meteor.User;
    token: string;
    url: string;
    options: SendEmailOptions;
  }

  function sendEnrollmentEmail(
    userId: string,
    email?: string,
    extraTokenData?: Record<string, unknown>,
    extraParams?: Record<string, unknown>
  ): Promise<SendEmailResult>;

  function sendResetPasswordEmail(
    userId: string,
    email?: string,
    extraTokenData?: Record<string, unknown>,
    extraParams?: Record<string, unknown>
  ): Promise<SendEmailResult>;

  function sendVerificationEmail(
    userId: string,
    email?: string,
    extraTokenData?: Record<string, unknown>,
    extraParams?: Record<string, unknown>
  ): Promise<SendEmailResult>;

  function setUsername(userId: string, newUsername: string): Promise<void>;

  function setPasswordAsync(
    userId: string,
    newPassword: string,
    options?: { logout?: boolean | undefined }
  ): Promise<void>;

  type ValidateNewUserCallback = (user: Meteor.User) => boolean | Promise<boolean>;
  function validateNewUser(func: ValidateNewUserCallback): void;
  function validateNewUser(func: Function): void;

  function validateLoginAttempt(
    func: (attempt: IValidateLoginAttemptCbOpts) => boolean | Promise<boolean>
  ): {
    stop: () => void;
  };
  function validateLoginAttempt(func: Function): { stop: () => void };

  function _hashPassword(
    password: string
  ): { digest: string; algorithm: string };

  interface IValidateLoginAttemptCbOpts {
    type: string;
    allowed: boolean;
    error?: Error | Meteor.Error | undefined;
    user?: Meteor.User | undefined;
    connection: Meteor.Connection;
    methodName: string;
    methodArguments: unknown[];
  }
}

export namespace Accounts {
  interface LogoutHookOptions {
      user?: Meteor.User | undefined;
      connection: Meteor.Connection;
    }

  function onLogout(func: (options?: LogoutHookOptions) => void | Promise<void>
  ): {
    stop: () => void;
  };
  function onLogout(func: Function): { stop: () => void };
}

export namespace Accounts {
  interface LoginMethodOptions {
    /**
     * The method to call (default 'login')
     */
    methodName?: string | undefined;
    /**
     * The arguments for the method
     */
    methodArguments?: unknown[] | undefined;
    /**
     * If provided, will be called with the result of the
     * method. If it throws, the client will not be logged in (and
     * its error will be passed to the callback).
     */
    validateResult?: ((result: Meteor.LoginMethodResult) => void) | undefined;
    /**
     * Will be called with no arguments once the user is fully
     * logged in, or with the error on error.
     */
    userCallback?: (err?: Error | Meteor.Error | Meteor.TypedError,
      loginDetails?: Meteor.LoginMethodResult) => void;
  }

  /**
   *
   * Call a login method on the server.
   *
   * A login method is a method which on success calls `this.setUserId(id)` and
   * `Accounts._setLoginToken` on the server and returns an object with fields
   * 'id' (containing the user id), 'token' (containing a resume token), and
   * optionally `tokenExpires`.
   *
   * This function takes care of:
   * - Updating the Meteor.loggingIn() reactive data source
   * - Calling the method in 'wait' mode
   * - On success, saving the resume token to localStorage
   * - On success, calling Accounts.connection.setUserId()
   * - Setting up an onReconnect handler which logs in with
   *   the resume token
   *
   * Options:
   * - methodName: The method to call (default 'login')
   * - methodArguments: The arguments for the method
   * - validateResult: If provided, will be called with the result of the
   *   method. If it throws, the client will not be logged in (and
   *   its error will be passed to the callback).
   * - userCallback: Will be called with no arguments once the user is fully
   * logged in, or with the error on error.
   *
   * */
  function callLoginMethod(options: LoginMethodOptions): void;

  type LoginMethodResult =
    | { error: Error } | {
    userId: string;
    error?: Error;
    stampedLoginToken?: StampedLoginToken;
    options?: Record<string, unknown>;
  };

  /**
   *
   * The main entry point for auth packages to hook in to login.
   *
   * A login handler is a login method which can return `undefined` to
   * indicate that the login request is not handled by this handler.
   *
   * @param name {String} Optional.  The service name, used by default
   * if a specific service name isn't returned in the result.
   *
   * @param handler {Function} A function that receives an options object
   * (as passed as an argument to the `login` method) and returns one of:
   * - `undefined`, meaning don't handle;
   * - a login method result object
   **/
  type LoginHandler = {
    bivarianceHack (options: Record<string, unknown>): undefined | LoginMethodResult | Promise<undefined | LoginMethodResult>;
  }["bivarianceHack"];
  function registerLoginHandler(handler: LoginHandler
  ): void;
  function registerLoginHandler(
    name: string,
    handler: LoginHandler
  ): void;

  type Password =
    | string
    | {
      digest: string;
      algorithm: 'sha-256';
    };

  /**
   *
   * Check whether the provided password matches the encrypted password in
   * the database user record. `password` can be a string (in which case
   * it will be run through SHA256 before bcrypt or argon2) or an object with
   * properties `digest` and `algorithm` (in which case we bcrypt/argon2
   * `password.digest`).
   */
  function _checkPasswordAsync(
    user: Meteor.User,
    password: Password
  ): Promise<{ userId: string; error?: Meteor.Error }>;
}

export namespace Accounts {
  type StampedLoginToken = {
    token: string;
    when: Date;
  };
  type HashedStampedLoginToken = {
    hashedToken: string;
    when: Date;
  };

  function _generateStampedLoginToken(): StampedLoginToken;
  function _hashStampedToken(token: StampedLoginToken): HashedStampedLoginToken;
  function _insertHashedLoginToken<T>(
    userId: string,
    token: HashedStampedLoginToken,
    query?: Mongo.Selector<T> | Mongo.ObjectID | string
  ): Promise< void>;
  function _hashLoginToken(token: string): string;
}

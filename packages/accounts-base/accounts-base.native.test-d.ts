import { expectTypeOf } from "expect-type";
import {
  Accounts,
  AccountsClient,
} from "./accounts-base.native";
import type {
  URLS,
  EmailFields,
  AccountsClientOptions,
  Header,
  EmailTemplates,
  WebAuthnConfigOptions,
  SecondFactorDescriptor,
} from "./accounts-base.native";
import type { Meteor } from "meteor/meteor";
import type { DDP } from "meteor/ddp";
import type { Mongo } from "meteor/mongo";

expectTypeOf<URLS>().toBeObject();
expectTypeOf<EmailFields>().toBeObject();
expectTypeOf<AccountsClientOptions>().toBeObject();
expectTypeOf<Header>().toBeObject();
expectTypeOf<EmailTemplates>().toBeObject();

// @ts-expect-error AccountsCommon requires options and reads them immediately.
new AccountsClient();
const sessionAccountsClientOptions: AccountsClientOptions = {
  clientStorage: "session",
};
const httpOnlyAccountsClientOptions: AccountsClientOptions = {
  useHttpOnlyCookies: true,
};
declare const usersCollection: Mongo.Collection<Meteor.User>;
const collectionAccountsClientOptions: AccountsClientOptions = {
  collection: usersCollection,
};
expectTypeOf(AccountsClient).toBeConstructibleWith(
  sessionAccountsClientOptions,
);
expectTypeOf(AccountsClient).toBeConstructibleWith(
  httpOnlyAccountsClientOptions,
);
expectTypeOf(AccountsClient).toBeConstructibleWith(
  collectionAccountsClientOptions,
);
expectTypeOf(
  new AccountsClient(sessionAccountsClientOptions).connection,
).toEqualTypeOf<DDP.DDPStatic>();
expectTypeOf(Accounts).toBeObject();

// --- Accounts consts / vars ---
expectTypeOf(Accounts.urls).toBeObject();
expectTypeOf(Accounts.loginServiceConfiguration).not.toBeAny();
expectTypeOf(Accounts.ui).toBeObject();
expectTypeOf(Accounts.emailTemplates).toBeObject();

// --- Accounts user / session functions ---
expectTypeOf(Accounts.user).toBeFunction();
expectTypeOf(Accounts.user()).toEqualTypeOf<
  Meteor.User | null | undefined | Promise<Meteor.User | undefined>
>();
expectTypeOf(Accounts.userAsync).toBeFunction();
expectTypeOf(Accounts.userAsync()).toEqualTypeOf<
  Promise<Meteor.User | null | undefined>
>();
expectTypeOf(Accounts.userId).toBeFunction();
expectTypeOf(Accounts.createUser).toBeFunction();
expectTypeOf(Accounts.createUserAsync).toBeFunction();
expectTypeOf(Accounts.createUserVerifyingEmail).toBeFunction();
expectTypeOf(Accounts.config).toBeFunction();

// --- Accounts login hooks ---
expectTypeOf(Accounts.onLogin).toBeFunction();
expectTypeOf(Accounts.onLoginFailure).toBeFunction();
expectTypeOf(Accounts.loginServicesConfigured).toBeFunction();
expectTypeOf(Accounts.onPageLoadLogin).toBeFunction();
expectTypeOf(Accounts.loginWithTokenAsync).toBeFunction();
expectTypeOf<Accounts.LoginHookCallbackOptions>().toBeObject();
expectTypeOf<Accounts.PageLoadLoginAttemptInfo>().toBeObject();

const clientLoginFailure: Accounts.LoginHookCallbackOptions = {
  error: new Error("login failed"),
};
expectTypeOf(clientLoginFailure.error).toEqualTypeOf<
  Error | Meteor.Error | undefined
>();

Accounts.onPageLoadLogin((attempt: Accounts.PageLoadLoginAttemptInfo) => {
  expectTypeOf(attempt.type).toBeString();
  expectTypeOf(attempt.allowed).toBeBoolean();
  expectTypeOf(attempt.error).toEqualTypeOf<
    Error | Meteor.Error | undefined
  >();
  expectTypeOf(attempt.methodName).toBeString();
  expectTypeOf(attempt.methodArguments).toEqualTypeOf<unknown[]>();
});

Accounts.config({
  clientStorage: "none",
  useHttpOnlyCookies: true,
  httpOnlyCookieAllowedOrigins: ["https://app.example.com"],
  httpOnlyCookieRateLimit: { max: 30, windowMs: 10_000 },
  collection: usersCollection,
  restrictCreationByEmailDomain: (email) => {
    expectTypeOf(email).toBeString();
    return email.endsWith("@meteor.com");
  },
});

Accounts.config({ httpOnlyCookieRateLimit: false });

// @ts-expect-error Cookie origins must be an array of strings.
Accounts.config({ httpOnlyCookieAllowedOrigins: "https://app.example.com" });
// @ts-expect-error The rate limit accepts configuration or false, not true.
Accounts.config({ httpOnlyCookieRateLimit: true });

declare const legacyAccountsCallback: Function;
Accounts.onLogin(legacyAccountsCallback);
Accounts.onEmailVerificationLink(legacyAccountsCallback);
Accounts.validateNewUser(legacyAccountsCallback);

// --- Accounts password / email flows ---
expectTypeOf(Accounts.changePassword).toBeFunction();
expectTypeOf(Accounts.forgotPassword).toBeFunction();
expectTypeOf(Accounts.resetPassword).toBeFunction();
expectTypeOf(Accounts.verifyEmail).toBeFunction();
expectTypeOf(Accounts.changePassword).returns.toBeVoid();
expectTypeOf(Accounts.forgotPassword).returns.toBeVoid();
expectTypeOf(Accounts.resetPassword).returns.toBeVoid();
expectTypeOf(Accounts.verifyEmail).returns.toBeVoid();
expectTypeOf(Accounts.onEmailVerificationLink).toBeFunction();
expectTypeOf(Accounts.onEnrollmentLink).toBeFunction();
expectTypeOf(Accounts.onResetPasswordLink).toBeFunction();

// --- Accounts login/logout state ---
expectTypeOf(Accounts.loggingIn).toBeFunction();
expectTypeOf(Accounts.loggingOut).toBeFunction();
expectTypeOf(Accounts.logout).toBeFunction();
expectTypeOf(Accounts.logoutAsync).toBeFunction();
expectTypeOf(Accounts.logoutAllClients).toBeFunction();
expectTypeOf(Accounts.logout).returns.toBeVoid();
expectTypeOf(Accounts.logoutAllClients).returns.toBeVoid();
expectTypeOf(Accounts.logoutAllClientsAsync).toBeFunction();
expectTypeOf(Accounts.logoutAllClientsAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Accounts.logoutOtherClients).toBeFunction();
expectTypeOf(Accounts.logoutOtherClients).returns.toBeVoid();
expectTypeOf(Accounts.logoutOtherClientsAsync).toBeFunction();

// --- Accounts signup field types ---
expectTypeOf<Accounts.PasswordSignupField>().not.toBeAny();
expectTypeOf<Accounts.PasswordlessSignupField>().not.toBeAny();

// --- Accounts email management ---
expectTypeOf(Accounts.addEmailAsync).toBeFunction();
expectTypeOf(Accounts.removeEmail).toBeFunction();
expectTypeOf(Accounts.replaceEmailAsync).toBeFunction();
expectTypeOf(Accounts.onCreateUser).toBeFunction();
expectTypeOf<Accounts.CreateUserCallback>().returns.toEqualTypeOf<
  Meteor.User | Promise<Meteor.User>
>();
Accounts.onCreateUser((_options, user) => Promise.resolve(user));
Accounts.onCreateUser(legacyAccountsCallback);
Accounts.validateNewUser(async (user) => {
  expectTypeOf(user).toEqualTypeOf<Meteor.User>();
  return true;
});
expectTypeOf(Accounts.findUserByEmail).toBeFunction();
expectTypeOf(Accounts.findUserByUsername).toBeFunction();

// --- Accounts email sending ---
expectTypeOf<Accounts.SendEmailOptions>().toBeObject();
expectTypeOf<Accounts.SendEmailResult>().toBeObject();
expectTypeOf(Accounts.sendEnrollmentEmail).toBeFunction();
expectTypeOf(Accounts.sendResetPasswordEmail).toBeFunction();
expectTypeOf(Accounts.sendVerificationEmail).toBeFunction();

// --- Accounts user mutation / validation ---
expectTypeOf(Accounts.setUsername).toBeFunction();
expectTypeOf(Accounts.setPasswordAsync).toBeFunction();
expectTypeOf(Accounts.validateNewUser).toBeFunction();
expectTypeOf<Accounts.ValidateNewUserCallback>().returns.toEqualTypeOf<
  boolean | Promise<boolean>
>();
expectTypeOf(Accounts.validateNewUser).returns.toBeVoid();
expectTypeOf(Accounts.validateLoginAttempt).toBeFunction();
expectTypeOf<Accounts.IValidateLoginAttemptCbOpts>().toBeObject();
expectTypeOf<Accounts.LogoutHookOptions>().toBeObject();
expectTypeOf(Accounts.onLogout).toBeFunction();
expectTypeOf<Accounts.IValidateLoginAttemptCbOpts["user"]>().toEqualTypeOf<
  Meteor.User | undefined
>();
expectTypeOf<Accounts.IValidateLoginAttemptCbOpts["error"]>().toEqualTypeOf<
  Error |
  Meteor.Error | undefined
>();
Accounts.onLogout((options) => {
  expectTypeOf(options).toEqualTypeOf<Accounts.LogoutHookOptions | undefined>();
  if (options) {
    expectTypeOf(options.user).toEqualTypeOf<Meteor.User | undefined>();
  }
});

Accounts.onLogout((options: { user: Meteor.User; connection: Meteor.Connection }) => {
  options.user._id;
});

// --- Accounts login method plumbing ---
expectTypeOf<Accounts.LoginMethodOptions>().toBeObject();
expectTypeOf(Accounts.callLoginMethod).toBeFunction();
Accounts.callLoginMethod({
  validateResult(result) {
    expectTypeOf(result).toEqualTypeOf<Meteor.LoginMethodResult>();
  },
  userCallback(error, loginDetails) {
    expectTypeOf(error).toEqualTypeOf<Error | Meteor.Error | Meteor.TypedError | undefined>();
    expectTypeOf(loginDetails).toEqualTypeOf<Meteor.LoginMethodResult | undefined>();
  },
});
expectTypeOf<Accounts.LoginMethodResult>().not.toBeAny();
expectTypeOf(Accounts.registerLoginHandler).toBeFunction();
expectTypeOf<Accounts.LoginHandler>().toBeFunction();
Accounts.registerLoginHandler((options: { resume: string }) => {
  expectTypeOf(options.resume).toBeString();
  return undefined;
});
expectTypeOf<Accounts.Password>().not.toBeAny();
expectTypeOf<Accounts.StampedLoginToken>().toBeObject();
expectTypeOf<Accounts.HashedStampedLoginToken>().toBeObject();
expectTypeOf(Accounts._insertHashedLoginToken).returns.toEqualTypeOf<Promise<void>>();

// Second factors: the registry consulted by password and passwordless logins.
expectTypeOf<WebAuthnConfigOptions>().toBeObject();
expectTypeOf<SecondFactorDescriptor>().toBeObject();
expectTypeOf(Accounts.registerSecondFactor).returns.toHaveProperty("stop");
Accounts.registerSecondFactor("totp", {
  isEnabledFor: (user) => !!user.services,
  isAvailableFor: (user) => !!user.services,
  hasInput: (options) => typeof options.code === "string",
  verify: async () => {},
  onMissingInput: () => {
    throw new Error("code required");
  },
  inputKey: "code",
});
Accounts.config({ webauthn: { rpID: "example.com", origins: ["https://example.com"] } });

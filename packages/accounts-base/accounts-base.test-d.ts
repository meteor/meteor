import { expectTypeOf } from "expect-type";
import {
  Accounts,
  AccountsClient,
} from "./accounts-base";
import type {
  URLS,
  EmailFields,
  AccountsClientOptions,
  Header,
  EmailTemplates,
} from "./accounts-base";
import type { Meteor } from "meteor/meteor";
import type { DDP } from "meteor/ddp";

expectTypeOf<URLS>().toBeObject();
expectTypeOf<EmailFields>().toBeObject();
expectTypeOf<AccountsClientOptions>().toBeObject();
expectTypeOf<Header>().toBeObject();
expectTypeOf<EmailTemplates>().toBeObject();

expectTypeOf(AccountsClient).toBeConstructibleWith();
expectTypeOf(new AccountsClient().connection).toEqualTypeOf<DDP.DDPStatic>();
expectTypeOf(Accounts).toBeObject();

// --- Accounts consts / vars ---
expectTypeOf(Accounts.urls).toBeObject();
expectTypeOf(Accounts.loginServiceConfiguration).not.toBeAny();
expectTypeOf(Accounts.ui).toBeObject();
expectTypeOf(Accounts.emailTemplates).toBeObject();

// --- Accounts user / session functions ---
expectTypeOf(Accounts.user).toBeFunction();
expectTypeOf(Accounts.userAsync).toBeFunction();
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
  expectTypeOf(attempt.methodArguments).toEqualTypeOf<any[]>();
});

// --- Accounts password / email flows ---
expectTypeOf(Accounts.changePassword).toBeFunction();
expectTypeOf(Accounts.forgotPassword).toBeFunction();
expectTypeOf(Accounts.resetPassword).toBeFunction();
expectTypeOf(Accounts.verifyEmail).toBeFunction();
expectTypeOf(Accounts.onEmailVerificationLink).toBeFunction();
expectTypeOf(Accounts.onEnrollmentLink).toBeFunction();
expectTypeOf(Accounts.onResetPasswordLink).toBeFunction();

// --- Accounts login/logout state ---
expectTypeOf(Accounts.loggingIn).toBeFunction();
expectTypeOf(Accounts.loggingOut).toBeFunction();
expectTypeOf(Accounts.logout).toBeFunction();
expectTypeOf(Accounts.logoutAsync).toBeFunction();
expectTypeOf(Accounts.logoutAllClients).toBeFunction();
expectTypeOf(Accounts.logout).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Accounts.logoutAllClients).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Accounts.logoutAllClientsAsync).toBeFunction();
expectTypeOf(Accounts.logoutAllClientsAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Accounts.logoutOtherClients).toBeFunction();
expectTypeOf(Accounts.logoutOtherClients).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Accounts.logoutOtherClientsAsync).toBeFunction();

// --- Accounts signup field types ---
expectTypeOf<Accounts.PasswordSignupField>().not.toBeAny();
expectTypeOf<Accounts.PasswordlessSignupField>().not.toBeAny();

// --- Accounts email management ---
expectTypeOf(Accounts.addEmailAsync).toBeFunction();
expectTypeOf(Accounts.removeEmail).toBeFunction();
expectTypeOf(Accounts.replaceEmailAsync).toBeFunction();
expectTypeOf(Accounts.onCreateUser).toBeFunction();
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
expectTypeOf(Accounts.validateNewUser).returns.toBeBoolean();
expectTypeOf(Accounts.validateLoginAttempt).toBeFunction();
expectTypeOf<Accounts.IValidateLoginAttemptCbOpts>().toBeObject();
expectTypeOf(Accounts.onLogout).toBeFunction();
expectTypeOf<Accounts.IValidateLoginAttemptCbOpts["user"]>().toEqualTypeOf<
  Meteor.User
>();
expectTypeOf<Accounts.IValidateLoginAttemptCbOpts["error"]>().toEqualTypeOf<
  Meteor.Error
>();
Accounts.onLogout(({ user }) => {
  expectTypeOf(user).toEqualTypeOf<Meteor.User>();
});

Accounts.onLogout((options: { user: Meteor.User; connection: Meteor.Connection }) => {
  options.user._id;
});

// --- Accounts login method plumbing ---
expectTypeOf<Accounts.LoginMethodOptions>().toBeObject();
expectTypeOf(Accounts.callLoginMethod).toBeFunction();
expectTypeOf<Accounts.LoginMethodResult>().not.toBeAny();
expectTypeOf(Accounts.registerLoginHandler).toBeFunction();
expectTypeOf<Accounts.Password>().not.toBeAny();
expectTypeOf<Accounts.StampedLoginToken>().toBeObject();
expectTypeOf<Accounts.HashedStampedLoginToken>().toBeObject();

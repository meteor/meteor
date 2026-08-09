import { expectTypeOf } from "expect-type";
import { Meteor } from "./meteor";
import type { global_Error, Subscription } from "./meteor";

expectTypeOf(Meteor).toBeObject();
expectTypeOf<global_Error>().toEqualTypeOf<Error>();
expectTypeOf<Subscription>().toBeObject();

// --- Global props ---
expectTypeOf(Meteor.isClient).toBeBoolean();
expectTypeOf(Meteor.isCordova).toBeBoolean();
expectTypeOf(Meteor.isServer).toBeBoolean();
expectTypeOf(Meteor.isProduction).toBeBoolean();
expectTypeOf(Meteor.release).toBeString();
expectTypeOf(Meteor.isDevelopment).toBeBoolean();
expectTypeOf(Meteor.isModern).toBeBoolean();
expectTypeOf(Meteor.gitCommitHash).not.toBeAny();
expectTypeOf(Meteor.isTest).toBeBoolean();
expectTypeOf(Meteor.isAppTest).toBeBoolean();
expectTypeOf(Meteor.isPackageTest).toBeBoolean();

// --- Errors ---
expectTypeOf<Meteor.ErrorConstructor>().toBeObject();
expectTypeOf(Meteor.makeErrorType).toBeFunction();
expectTypeOf(Meteor.Error).not.toBeAny();
expectTypeOf<Meteor.ErrorStatic>().toBeObject();
// TypedError is a type only (no runtime value); assert it as a type.
expectTypeOf<Meteor.TypedError>().toBeObject();

// --- Settings ---
expectTypeOf<Meteor.Settings>().toBeObject();
expectTypeOf(Meteor.settings).toBeObject();

// --- User ---
expectTypeOf<Meteor.UserEmail>().toBeObject();
expectTypeOf<Meteor.UserProfile>().toBeObject();
expectTypeOf<Meteor.User>().toBeObject();
expectTypeOf(Meteor.user).toBeFunction();
expectTypeOf(Meteor.userAsync).toBeFunction();
expectTypeOf(Meteor.userId).toBeFunction();
expectTypeOf(Meteor.users).not.toBeAny();
expectTypeOf<Meteor.LoginMethodResult>().toBeObject();

// --- Method ---
expectTypeOf<Meteor.MethodThisType>().toBeObject();
expectTypeOf(Meteor.methods).toBeFunction();
expectTypeOf(Meteor.call).toBeFunction();
expectTypeOf(Meteor.callAsync).toBeFunction();
expectTypeOf<Meteor.MethodApplyOptions<any>>().toBeObject();
expectTypeOf(Meteor.apply).toBeFunction();
expectTypeOf(Meteor.applyAsync).toBeFunction();

// --- Url ---
expectTypeOf(Meteor.absoluteUrl).not.toBeAny();
expectTypeOf<Meteor.absoluteUrlOptions>().toBeObject();

// --- Timeout ---
expectTypeOf(Meteor.setInterval).toBeFunction();
expectTypeOf(Meteor.setTimeout).toBeFunction();
expectTypeOf(Meteor.clearInterval).toBeFunction();
expectTypeOf(Meteor.clearTimeout).toBeFunction();
expectTypeOf(Meteor.defer).toBeFunction();
expectTypeOf(Meteor.deferrable).toBeFunction();
expectTypeOf(Meteor.deferDev).toBeFunction();
expectTypeOf(Meteor.deferProd).toBeFunction();

// --- utils ---
expectTypeOf(Meteor.startup).toBeFunction();
expectTypeOf(Meteor.fetch).toBeFunction();
expectTypeOf(Meteor.wrapAsync).toBeFunction();
expectTypeOf(Meteor.bindEnvironment).toBeFunction();
expectTypeOf(Meteor.EnvironmentVariable).not.toBeAny();

// --- Pub/Sub ---
expectTypeOf<Meteor.SubscriptionHandle>().toBeObject();
expectTypeOf<Meteor.LiveQueryHandle>().toBeObject();
expectTypeOf(Meteor.subscribe).toBeFunction();
expectTypeOf(Meteor.publish).toBeFunction();

// --- Login ---
expectTypeOf<Meteor.LoginWithExternalServiceOptions>().toBeObject();
// OAuth login helpers (loginWithFacebook/Github/Google/Meetup/
// MeteorDeveloperAccount/Twitter/Weibo) are owned by their accounts-<service>
// packages and asserted in those packages' .test-d.ts.
expectTypeOf(Meteor.loginWithPassword).toBeFunction();
expectTypeOf(Meteor.loginWithToken).toBeFunction();
expectTypeOf(Meteor.loginWithPasswordAsync).toBeFunction();
expectTypeOf(Meteor.loginWithTokenAsync).toBeFunction();
expectTypeOf(Meteor.loggingIn).toBeFunction();
expectTypeOf(Meteor.loggingOut).toBeFunction();
expectTypeOf(Meteor.logout).toBeFunction();
expectTypeOf(Meteor.logoutAsync).toBeFunction();
expectTypeOf(Meteor.logoutAllClients).toBeFunction();
expectTypeOf(Meteor.logoutAllClientsAsync).toBeFunction();
expectTypeOf(Meteor.logoutOtherClients).toBeFunction();
expectTypeOf(Meteor.logoutOtherClientsAsync).toBeFunction();

// --- Connection / Status ---
expectTypeOf(Meteor.reconnect).toBeFunction();
expectTypeOf(Meteor.disconnect).toBeFunction();
expectTypeOf(Meteor.status).toBeFunction();
expectTypeOf<Meteor.Connection>().toBeObject();
expectTypeOf(Meteor.onConnection).toBeFunction();

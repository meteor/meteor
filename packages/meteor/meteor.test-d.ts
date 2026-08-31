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
expectTypeOf(Meteor.release).toEqualTypeOf<string | undefined>();
expectTypeOf(Meteor.meteorRelease).toBeString();
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
expectTypeOf<Meteor.TypedError>().toBeObject();
expectTypeOf(new Meteor.TypedError("message", "type")).toMatchTypeOf<
  Meteor.TypedError
>();
expectTypeOf<Meteor.TypedErrorStatic>().toBeConstructibleWith("message", "type");

declare const legacyEvent: Meteor.Event;
expectTypeOf<Meteor.Event>().toBeObject();
expectTypeOf(legacyEvent.type).toBeString();
expectTypeOf<Meteor.EventHandlerFunction>().toBeFunction();
expectTypeOf<Meteor.EventMap>().toMatchTypeOf<Record<string, Function>>();

// --- Settings ---
expectTypeOf<Meteor.Settings>().toBeObject();
expectTypeOf(Meteor.settings).toBeObject();
expectTypeOf(
Meteor.settings.privateFeature).toEqualTypeOf<unknown>();

// --- User ---
expectTypeOf<Meteor.UserEmail>().toBeObject();
expectTypeOf<Meteor.UserProfile>().toBeObject();
expectTypeOf<Meteor.User>().toBeObject();
declare const legacyUser: Meteor.User;
expectTypeOf(legacyUser.services).toEqualTypeOf<Record<string, unknown> | undefined>();
  expectTypeOf( Meteor.user).toBeFunction();
expectTypeOf(Meteor.userAsync).toBeFunction();
expectTypeOf(Meteor.userId).toBeFunction();
expectTypeOf(Meteor.users).not.toBeAny();
expectTypeOf<Meteor.LoginMethodResult>().toBeObject();

// --- Method ---
expectTypeOf<Meteor.MethodThisType>().toBeObject();
expectTypeOf<Meteor.MethodHandler>().toBeFunction();
expectTypeOf(Meteor.methods).toBeFunction();
interface NamedMethodDictionary {
  greet (name: string): string;
}
const namedMethods: NamedMethodDictionary = {
  greet(name) {
    return `Hello ${name}`;
  },
};
Meteor.methods(namedMethods);
Meteor.methods({
  async assumeIdentity(userId: string) {
    expectTypeOf(this.setUserId(userId)).toEqualTypeOf<Promise<void>>();
    await this.setUserId(userId);
  },
});
expectTypeOf(Meteor.call).toBeFunction();
expectTypeOf(Meteor.call<{ ok: boolean }>("typed-result")).toEqualTypeOf<
  { ok: boolean } | undefined | Promise<{ ok: boolean }>
>();
expectTypeOf(Meteor.call<number>("sum", 1, 2)).toEqualTypeOf<
  number | undefined | Promise<number>
>();
expectTypeOf(Meteor.call<{ ok: boolean }>("typed-callback", (error, result) => {
  expectTypeOf(error).not.toBeAny();
  expectTypeOf(result).not.toBeAny();
  expectTypeOf(error).toEqualTypeOf<Error | Meteor.Error | undefined>();
  expectTypeOf(result).toEqualTypeOf<{ ok: boolean } | undefined>();
})).toBeVoid();
expectTypeOf(Meteor.call("callback", (error) => {
  expectTypeOf(error).toEqualTypeOf<Error | Meteor.Error | undefined>();
})).toBeVoid();
expectTypeOf(Meteor.callAsync).toBeFunction();
expectTypeOf<Meteor.MethodApplyOptions<string>>().toBeObject();
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
declare const legacyMeteorCallback: Function;
Meteor.startup(legacyMeteorCallback);
Meteor.setTimeout(legacyMeteorCallback, 0);
Meteor.makeErrorType("LegacyError", legacyMeteorCallback);
expectTypeOf(Meteor.EnvironmentVariable).not.toBeAny();

// --- Pub/Sub ---
expectTypeOf<Meteor.SubscriptionHandle>().toBeObject();
expectTypeOf<Meteor.LiveQueryHandle>().toBeObject();
expectTypeOf(Meteor.subscribe).toBeFunction();
expectTypeOf(Meteor.publish).toBeFunction();
Meteor.publish("owned", function (ownerId: string) {
  ownerId.toUpperCase();
});

// --- Login ---
expectTypeOf<Meteor.LoginWithExternalServiceOptions>().toBeObject();
expectTypeOf(Meteor.loginWithFacebook).toBeFunction();
expectTypeOf(Meteor.loginWithGithub).toBeFunction();
expectTypeOf(Meteor.loginWithGoogle).toBeFunction();
expectTypeOf(Meteor.loginWithMeetup).toBeFunction();
expectTypeOf(Meteor.loginWithMeteorDeveloperAccount).toBeFunction();
expectTypeOf(Meteor.loginWithTwitter).toBeFunction();
expectTypeOf(Meteor.loginWithWeibo).toBeFunction();
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

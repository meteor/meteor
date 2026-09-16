import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";
import { Accounts } from "meteor/accounts-base";
import type {
  WebAuthnCredentialInfo,
  WebAuthnRegistrationInfo,
  WebAuthnRegistrationContext,
  CreateUserWithWebAuthnOptions,
  WebAuthnSelector,
  WebAuthnCallback,
  WebAuthnLoginCallback,
  WebAuthnRegistrationValidator,
  WebAuthnCredentialChange,
} from "./accounts-webauthn";

expectTypeOf<WebAuthnCredentialInfo>().toBeObject();
expectTypeOf<WebAuthnCredentialInfo["deviceType"]>().toEqualTypeOf<
  "singleDevice" | "multiDevice"
>();
expectTypeOf<WebAuthnRegistrationInfo>().toBeObject();
expectTypeOf<WebAuthnRegistrationContext>().toBeObject();
expectTypeOf<WebAuthnRegistrationContext["mode"]>().toEqualTypeOf<
  "addCredential" | "signup"
>();
expectTypeOf<CreateUserWithWebAuthnOptions>().toBeObject();
expectTypeOf<WebAuthnSelector>().toMatchTypeOf<
  string | { id: string } | { username: string } | { email: string }
>();
expectTypeOf<WebAuthnCallback>().toBeFunction();
expectTypeOf<WebAuthnCallback<boolean>>().parameter(1).toEqualTypeOf<boolean | undefined>();
expectTypeOf<WebAuthnLoginCallback>().toBeFunction();
expectTypeOf<WebAuthnRegistrationValidator>().toBeFunction();

// accounts-webauthn augments Meteor with login helpers...
expectTypeOf(Meteor.loginWithWebAuthn).toBeFunction();
expectTypeOf(Meteor.loginWithWebAuthnAsync).toBeFunction();
expectTypeOf(Meteor.loginWithWebAuthnAsync).returns.resolves.toBeObject();
expectTypeOf(Meteor.loginWithPasswordAndWebAuthn).toBeFunction();
expectTypeOf(Meteor.loginWithPasswordAndWebAuthnAsync).toBeFunction();
expectTypeOf(Meteor.passwordlessLoginWithTokenAndWebAuthn).toBeFunction();
expectTypeOf(Meteor.passwordlessLoginWithTokenAndWebAuthnAsync).toBeFunction();

// Both call signatures of the usernameless / identifier-first login.
Meteor.loginWithWebAuthn(() => {});
Meteor.loginWithWebAuthn({ email: "a@b.c" }, () => {});
Meteor.loginWithWebAuthn("username");
Meteor.loginWithWebAuthn({ id: "user-id" });
// @ts-expect-error a selector object names exactly one identifier
Meteor.loginWithWebAuthn({ email: "a@b.c", username: "user" }, () => {});

// ...and Accounts with feature detection, credential management, sign-up,
// second-factor toggles and the server-side validation hook.
expectTypeOf(Accounts.isWebAuthnSupported).returns.toBeBoolean();
expectTypeOf(Accounts.isWebAuthnPlatformAuthenticatorAvailable).returns.resolves.toBeBoolean();
expectTypeOf(Accounts.registerWebAuthnCredential).toBeFunction();
expectTypeOf(Accounts.registerWebAuthnCredentialAsync).returns.resolves.toEqualTypeOf<WebAuthnCredentialInfo>();
expectTypeOf(Accounts.listWebAuthnCredentials).toBeFunction();
expectTypeOf(Accounts.listWebAuthnCredentialsAsync).returns.resolves.toEqualTypeOf<WebAuthnCredentialInfo[]>();
expectTypeOf(Accounts.renameWebAuthnCredential).toBeFunction();
expectTypeOf(Accounts.renameWebAuthnCredentialAsync).returns.resolves.toBeVoid();
expectTypeOf(Accounts.removeWebAuthnCredential).toBeFunction();
expectTypeOf(Accounts.removeWebAuthnCredentialAsync).returns.resolves.toBeVoid();
expectTypeOf(Accounts.createUserWithWebAuthn).toBeFunction();
expectTypeOf(Accounts.createUserWithWebAuthnAsync).returns.resolves.toBeObject();
expectTypeOf(Accounts.enableWebAuthnSecondFactor).toBeFunction();
expectTypeOf(Accounts.enableWebAuthnSecondFactorAsync).returns.resolves.toBeVoid();
expectTypeOf(Accounts.disableWebAuthnSecondFactor).toBeFunction();
expectTypeOf(Accounts.disableWebAuthnSecondFactorAsync).returns.resolves.toBeVoid();
expectTypeOf(Accounts.hasWebAuthnSecondFactorEnabled).toBeFunction();
expectTypeOf(Accounts.hasWebAuthnSecondFactorEnabledAsync).returns.resolves.toBeBoolean();
expectTypeOf(Accounts.validateWebAuthnRegistration).returns.toHaveProperty("stop");
expectTypeOf<WebAuthnCredentialChange>().toBeObject();
expectTypeOf<WebAuthnCredentialChange["action"]>().toEqualTypeOf<
  "added" | "renamed" | "removed"
>();
expectTypeOf(Accounts.onWebAuthnCredentialChange).returns.toHaveProperty("stop");
Accounts.onWebAuthnCredentialChange(async ({ userId, action, credential }) => {
  expectTypeOf(userId).toBeString();
  expectTypeOf(action).toBeString();
  expectTypeOf(credential.id).toBeString();
});
expectTypeOf(Accounts._checkWebAuthnSecondFactorEnabled).returns.toBeBoolean();

// registerWebAuthnCredential accepts a label, an options object, or only a callback.
Accounts.registerWebAuthnCredential("YubiKey");
Accounts.registerWebAuthnCredential({ name: "YubiKey" }, () => {});
Accounts.registerWebAuthnCredential(() => {});

// The validation hook can be synchronous or asynchronous.
Accounts.validateWebAuthnRegistration((info, context) => info.backedUp || context.mode === "signup");
Accounts.validateWebAuthnRegistration(async () => {});

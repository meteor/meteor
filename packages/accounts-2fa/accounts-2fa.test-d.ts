import { expectTypeOf } from "expect-type";
import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import type {
  TwoFactorActivationData,
  TwoFactorChangeAttempt,
  TwoFactorConfigureOptions,
  TwoFactorEmailOptions,
  TwoFactorFactorEvent,
} from "./accounts-2fa";

expectTypeOf<TwoFactorActivationData>().toEqualTypeOf<{
  svg: string;
  secret: string;
  uri: string;
}>();

expectTypeOf<TwoFactorChangeAttempt>().toEqualTypeOf<{
  type: "activation" | "deactivation";
  stage?: "setup" | "confirm";
  user: Meteor.User;
  connection: Meteor.Connection | null;
}>();

expectTypeOf<TwoFactorEmailOptions>().toEqualTypeOf<{
  enabled?: boolean;
  offerToOtpUsers?: boolean;
  requireVerified?: boolean;
  expirationMs?: number;
  maxAttempts?: number;
  resendCooldownMs?: number;
  hashSecret?: string | null;
}>();
expectTypeOf<TwoFactorConfigureOptions>().toEqualTypeOf<{ email?: TwoFactorEmailOptions }>();
expectTypeOf<TwoFactorFactorEvent>().toEqualTypeOf<{
  user: Meteor.User;
  connection: Meteor.Connection | null;
  method: "otp" | "email";
}>();

// Example from the package guide.
Accounts.configure2fa({ email: { enabled: true, hashSecret: "server-secret" } });
expectTypeOf(Accounts.configure2fa).returns.toBeVoid();
// @ts-expect-error unknown email option
Accounts.configure2fa({ email: { enable: true } });

expectTypeOf(Accounts.on2faVerified(({ user, method }) => {
  expectTypeOf(user).toEqualTypeOf<Meteor.User>();
  expectTypeOf(method).toEqualTypeOf<"otp" | "email">();
}).stop).toEqualTypeOf<() => void>();
expectTypeOf(Accounts.validate2faChallenge(async ({ user }) => {
  if (!user._id) {
    throw new Meteor.Error("locked", "Account locked");
  }
}).stop).toEqualTypeOf<() => void>();

Accounts.set2faContextProvider(() => ({ trustedDeviceToken: "token" }));
Accounts.set2faContextProvider(() => null);
Accounts.request2faEmailCode("user@example.com", "password", error => {
  expectTypeOf(error).toEqualTypeOf<Error | Meteor.Error | undefined>();
});
Accounts.request2faEmailCode({ username: "user" }, "password");

const changeHandle = Accounts.validate2faChange(({ type, stage }) => {
  if (type === "activation" && stage === "setup") {
    throw new Meteor.Error("2fa-change-refused", "Enrollment is not available");
  }
});
expectTypeOf(changeHandle.stop).toEqualTypeOf<() => void>();
Accounts.validate2faChange(async () => {});

// Members this package augments onto Accounts (meteor/accounts-base).
expectTypeOf(Accounts.has2faEnabled).toBeFunction();
expectTypeOf(Accounts.generate2faActivationQrCode).toBeFunction();
expectTypeOf(Accounts.enableUser2fa).toBeFunction();
expectTypeOf(Accounts.disableUser2fa).toBeFunction();
expectTypeOf(Accounts.validate2faChange).toBeFunction();
expectTypeOf(Accounts.configure2fa).toBeFunction();
expectTypeOf(Accounts.on2faVerified).toBeFunction();
expectTypeOf(Accounts.validate2faChallenge).toBeFunction();
expectTypeOf(Accounts.set2faContextProvider).toBeFunction();
expectTypeOf(Accounts.request2faEmailCode).toBeFunction();
expectTypeOf(Accounts._check2faEnabled).toBeFunction();
expectTypeOf(Accounts._is2faEnabledForUser).toBeFunction();
expectTypeOf(Accounts._generate2faToken).toBeFunction();
expectTypeOf(Accounts._isTokenValid).toBeFunction();

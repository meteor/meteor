import { expectTypeOf } from "expect-type";
import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import type {
  TwoFactorActivationData,
  TwoFactorChangeAttempt,
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
expectTypeOf(Accounts._check2faEnabled).toBeFunction();
expectTypeOf(Accounts._is2faEnabledForUser).toBeFunction();
expectTypeOf(Accounts._generate2faToken).toBeFunction();
expectTypeOf(Accounts._isTokenValid).toBeFunction();

import { expectTypeOf } from "expect-type";
import { Accounts } from "meteor/accounts-base";
import type {
  TwoFactorActivationData,
  TwoFactorConfigureOptions,
} from "./accounts-2fa";

expectTypeOf<TwoFactorActivationData>().toEqualTypeOf<{
  svg: string;
  secret: string;
  uri: string;
}>();

expectTypeOf<TwoFactorConfigureOptions>().toEqualTypeOf<{
  window?: number;
  preventReplay?: boolean;
  loginTypes?: string[];
}>();

// Example from the package guide.
Accounts.configure2fa({ window: 1 });
Accounts.configure2fa({ preventReplay: false, loginTypes: ["password", "custom"] });
expectTypeOf(Accounts.configure2fa).returns.toBeVoid();
// @ts-expect-error unknown option
Accounts.configure2fa({ windowSize: 1 });

expectTypeOf(Accounts._verify2faToken).returns.toEqualTypeOf<number | null>();
expectTypeOf(Accounts._generate2faToken("SECRET", Date.now())).toEqualTypeOf<{ token: string }>();

// Members this package augments onto Accounts (meteor/accounts-base).
expectTypeOf(Accounts.has2faEnabled).toBeFunction();
expectTypeOf(Accounts.generate2faActivationQrCode).toBeFunction();
expectTypeOf(Accounts.enableUser2fa).toBeFunction();
expectTypeOf(Accounts.disableUser2fa).toBeFunction();
expectTypeOf(Accounts.configure2fa).toBeFunction();
expectTypeOf(Accounts._check2faEnabled).toBeFunction();
expectTypeOf(Accounts._is2faEnabledForUser).toBeFunction();
expectTypeOf(Accounts._generate2faToken).toBeFunction();
expectTypeOf(Accounts._verify2faToken).toBeFunction();
expectTypeOf(Accounts._isTokenValid).toBeFunction();

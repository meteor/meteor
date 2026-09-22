import { expectTypeOf } from "expect-type";
import { Accounts } from "meteor/accounts-base";

// accounts-oauth augments Accounts with the oauth service registry + ConfigError.
expectTypeOf(Accounts.oauth).toBeObject();
expectTypeOf(Accounts.oauth.registerService).toBeFunction();
expectTypeOf(Accounts.oauth.registerService).parameter(0).toEqualTypeOf<string>();
expectTypeOf(Accounts.oauth.unregisterService).toBeFunction();
expectTypeOf(Accounts.oauth.serviceNames).returns.toEqualTypeOf<string[]>();
expectTypeOf(Accounts.oauth.tryLoginAfterPopupClosed).toBeFunction();
expectTypeOf(Accounts.oauth.credentialRequestCompleteHandler).toBeFunction();
expectTypeOf(Accounts.ConfigError).toBeConstructibleWith();

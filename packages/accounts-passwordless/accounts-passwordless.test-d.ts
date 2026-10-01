import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";
import { Accounts } from "meteor/accounts-base";

// accounts-passwordless augments Meteor with passwordless login helpers...
expectTypeOf(Meteor.passwordlessLoginWithToken).toBeFunction();
expectTypeOf(Meteor.passwordlessLoginWithTokenAnd2faCode).toBeFunction();

// ...and Accounts with the token request / auto-login / email helpers.
expectTypeOf(Accounts.requestLoginTokenForUser).toBeFunction();
expectTypeOf(Accounts.autoLoginWithToken).toBeFunction();
expectTypeOf(Accounts.sendLoginTokenEmail).toBeFunction();
expectTypeOf(Accounts.sendLoginTokenEmail).returns.resolves.toBeObject();

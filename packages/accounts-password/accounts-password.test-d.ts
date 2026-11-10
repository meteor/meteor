import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// This package's only surface is augmenting Meteor with a 2FA login helper.
expectTypeOf(Meteor.loginWithPasswordAnd2faCode).toBeFunction();

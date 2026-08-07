import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-github's only surface is augmenting Meteor with the loginWithGithub login helper.
expectTypeOf(Meteor.loginWithGithub).toBeFunction();
expectTypeOf(Meteor.loginWithGithub).returns.toBeVoid();
expectTypeOf(Meteor.loginWithGithub).parameter(0).toEqualTypeOf<
  Parameters<typeof Meteor.loginWithGithub>[0]
>();

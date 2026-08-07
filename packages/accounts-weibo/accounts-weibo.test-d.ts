import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-weibo's only surface is augmenting Meteor with the loginWithWeibo login helper.
expectTypeOf(Meteor.loginWithWeibo).toBeFunction();
expectTypeOf(Meteor.loginWithWeibo).returns.toBeVoid();
expectTypeOf(Meteor.loginWithWeibo).parameter(0).toEqualTypeOf<
  Parameters<typeof Meteor.loginWithWeibo>[0]
>();

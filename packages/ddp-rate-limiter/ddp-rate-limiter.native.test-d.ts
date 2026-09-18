import { expectTypeOf } from "expect-type";
import { DDPRateLimiter } from "./ddp-rate-limiter.native";

expectTypeOf(DDPRateLimiter).toBeObject();

// RateLimitResult shape
expectTypeOf<DDPRateLimiter.RateLimitResult>().toEqualTypeOf<{
  allowed: boolean;
  timeToReset: number;
  numInvocationsLeft: number;
  ruleId: string;
}>();

// Predicates retain the legacy string-only callback while accepting the
// runtime's null user ID and literal DDP event names.
const legacyMatcher: DDPRateLimiter.Matcher = {
  type: (type: string) => type.length > 0,
  userId: (userId: string) => userId.length > 0,
};
expectTypeOf(legacyMatcher).toBeObject();

// addRule
expectTypeOf(DDPRateLimiter.addRule).parameter(0).toEqualTypeOf<
  DDPRateLimiter.Matcher
>();
expectTypeOf(DDPRateLimiter.addRule).parameter(1).toEqualTypeOf<number | undefined>();
expectTypeOf(DDPRateLimiter.addRule).parameter(2).toEqualTypeOf<number | undefined>();
expectTypeOf(DDPRateLimiter.addRule).parameter(3).toEqualTypeOf<
  | ((
      result: DDPRateLimiter.RateLimitResult,
      input: {
        type?: string;
        name?: string;
        userId?: string | null;
        connectionId?: string;
        clientAddress?: string;
      }
    ) => void)
  | undefined
>();
expectTypeOf(DDPRateLimiter.addRule).returns.toBeString();

const ruleId = DDPRateLimiter.addRule(
  { type: "method", userId: (u: string | null) => u !== null },
  5,
  1000,
  (result) => {
    expectTypeOf(result).toEqualTypeOf<DDPRateLimiter.RateLimitResult>();
  },
);
expectTypeOf(ruleId).toBeString();

// removeRule
expectTypeOf(DDPRateLimiter.removeRule).parameters.toEqualTypeOf<[string]>();
expectTypeOf(DDPRateLimiter.removeRule).returns.toBeBoolean();

// setErrorMessage: string or function
expectTypeOf(DDPRateLimiter.setErrorMessage).parameters.toEqualTypeOf<
  [string | ((result: DDPRateLimiter.RateLimitResult) => string)]
>();
expectTypeOf(DDPRateLimiter.setErrorMessage).returns.toBeVoid();

// setErrorMessageOnRule
expectTypeOf(DDPRateLimiter.setErrorMessageOnRule).parameters.toEqualTypeOf<
  [string, string | ((result: DDPRateLimiter.RateLimitResult) => string)]
>();
expectTypeOf(DDPRateLimiter.setErrorMessageOnRule).returns.toBeVoid();

// getErrorMessage
expectTypeOf(DDPRateLimiter.getErrorMessage).parameters.toEqualTypeOf<
  [DDPRateLimiter.RateLimitResult]
>();
expectTypeOf(DDPRateLimiter.getErrorMessage).returns.toBeString();

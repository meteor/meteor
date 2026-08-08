import { expectTypeOf } from "expect-type";
import { DDPRateLimiter } from "./ddp-rate-limiter";

expectTypeOf(DDPRateLimiter).toBeObject();

// RateLimitResult shape
expectTypeOf<DDPRateLimiter.RateLimitResult>().toEqualTypeOf<{
  allowed: boolean;
  timeToReset: number;
  numInvocationsLeft: number;
  ruleId: string;
}>();

// Matcher: each field is string | (sync or async predicate) | undefined
expectTypeOf<DDPRateLimiter.Matcher>().toEqualTypeOf<{
  type?: string | ((type: "method" | "subscription") => boolean) | ((type: "method" | "subscription") => Promise<boolean>) | undefined;
  name?: string | ((name: string) => boolean) | ((name: string) => Promise<boolean>) | undefined;
  userId?: string | ((userId: string | null) => boolean) | ((userId: string | null) => Promise<boolean>) | undefined;
  connectionId?: string | ((connectionId: string) => boolean) | ((connectionId: string) => Promise<boolean>) | undefined;
  clientAddress?: string | ((clientAddress: string) => boolean) | ((clientAddress: string) => Promise<boolean>) | undefined;
}>();

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
  { type: "method", userId: (u) => u !== null },
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

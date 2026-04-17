import { expectTypeOf } from "expect-type";
import {
  RateLimiter,
  type RateLimiterInput,
  type RateLimiterCheckResult,
  type RateLimiterMatcher,
  type RateLimiterMatcherValue,
  type RateLimiterCallback,
} from "./rate-limit";

// Input / result shapes
expectTypeOf<RateLimiterInput>().toMatchTypeOf<{
  type?: "method" | "subscription";
  name?: string;
  userId?: string | null;
  connectionId?: string;
  clientAddress?: string;
}>();

expectTypeOf<RateLimiterCheckResult>().toEqualTypeOf<{
  allowed: boolean;
  timeToReset: number;
  numInvocationsLeft: number;
  ruleId?: string;
}>();

// Matcher value variants
expectTypeOf<RateLimiterMatcherValue<string>>().toEqualTypeOf<
  string | ((value: string) => boolean) | null
>();

// Matcher defaults to base input
expectTypeOf<RateLimiterMatcher>().toEqualTypeOf<
  RateLimiterMatcher<RateLimiterInput>
>();

// Callback shape
expectTypeOf<RateLimiterCallback>().toEqualTypeOf<
  (reply: RateLimiterCheckResult, input: RateLimiterInput) => void
>();

// Constructor + instance
const rl = new RateLimiter();
expectTypeOf(rl).toEqualTypeOf<RateLimiter>();
expectTypeOf(RateLimiter).toBeConstructibleWith();

// addRule
expectTypeOf(rl.addRule).returns.toBeString();
expectTypeOf(
  rl.addRule({ type: "method" }, 5, 1000, (reply) => {
    expectTypeOf(reply).toEqualTypeOf<RateLimiterCheckResult>();
  }),
).toBeString();

// Generic specialization
interface MyInput extends RateLimiterInput {
  tenant?: string;
}
rl.addRule<MyInput>(
  { tenant: (t) => t === "x" },
  1,
  2,
  (reply) => {
    expectTypeOf(reply).toEqualTypeOf<RateLimiterCheckResult>();
  },
);

// check / increment / removeRule
expectTypeOf(rl.check({ type: "method" })).toEqualTypeOf<RateLimiterCheckResult>();
expectTypeOf(rl.increment).parameter(0).toMatchTypeOf<RateLimiterInput>();
expectTypeOf(rl.increment({ name: "x" })).toBeVoid();
expectTypeOf(rl.removeRule).parameters.toEqualTypeOf<[string]>();
expectTypeOf(rl.removeRule("id")).toBeBoolean();

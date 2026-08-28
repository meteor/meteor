export interface RateLimiterInput {
  type?: "method" | "subscription";
  name?: string;
  userId?: string | null;
  connectionId?: string;
  clientAddress?: string;
  [key: string]: any;
}

export interface RateLimiterCheckResult {
  allowed: boolean;
  timeToReset: number;
  numInvocationsLeft: number;
  ruleId?: string;
}

type RateLimiterPredicate<V> = {
  bivarianceHack(value: V): boolean | Promise<boolean>;
}["bivarianceHack"];

export type RateLimiterMatcherValue<V> = V | RateLimiterPredicate<V> | null;

export type RateLimiterMatcher<Input extends RateLimiterInput = RateLimiterInput> = {
  [K in keyof Input]?: RateLimiterMatcherValue<Input[K]>;
};

export type RateLimiterCallback<Input extends RateLimiterInput = RateLimiterInput> = (
  reply: RateLimiterCheckResult,
  input: Input,
) => void;

export class RateLimiter {
  constructor();

  /**
   * Adds a rule to the rate limiter.
   * @param matcher    Object describing which inputs the rule applies to.
   * @param numRequestsAllowed Number of events allowed per interval (default 10).
   * @param intervalTime       Milliseconds before counters reset (default 1000).
   * @param callback   Optional function invoked with the check result and input after each evaluation.
   * @returns The unique id assigned to this rule, usable in `removeRule`.
   */
  addRule<Input extends RateLimiterInput = RateLimiterInput>(
    matcher: RateLimiterMatcher<Input>,
    numRequestsAllowed?: number,
    intervalTime?: number,
    callback?: RateLimiterCallback<Input>,
  ): string;

  /**
   * Checks whether an input has exceeded any matching rule.
   */
  check<Input extends RateLimiterInput = RateLimiterInput>(input: Input): RateLimiterCheckResult;

  /**
   * Increments counters for every rule that matches this input.
   */
  increment<Input extends RateLimiterInput = RateLimiterInput>(input: Input): void;

  /** Check the given rules against an input (lower-level than `check`). */
  checkRules<Input extends RateLimiterInput = RateLimiterInput>(
    rules: any[],
    input: Input,
  ): RateLimiterCheckResult;

  /** Increment counters for every rule in `rules` that matches this input. */
  incrementRules<Input extends RateLimiterInput = RateLimiterInput>(
    rules: any[],
    input: Input,
  ): void;

  /**
   * Removes a rule by its id. Returns true when the rule existed and was removed.
   */
  removeRule(id: string): boolean;
}

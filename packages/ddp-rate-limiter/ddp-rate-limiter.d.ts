export namespace DDPRateLimiter {
  export interface RateLimitResult {
    allowed: boolean;
    timeToReset: number;
    numInvocationsLeft: number;
    ruleId: string;
  }

  export interface Matcher {
    type?: string | ((type: 'method' | 'subscription') => boolean) | ((type: 'method' | 'subscription') => Promise<boolean>)  | null | undefined;
    name?: string | ((name: string) => boolean) | ((name: string) => Promise<boolean>)  | null | undefined;
    userId?: string | ((userId: string | null) => boolean) | ((userId: string | null) => Promise<boolean>)  | null | undefined;
    connectionId?: string | ((connectionId: string) => boolean) | ((connectionId: string) => Promise<boolean>)  | null | undefined;
    clientAddress?: string | ((clientAddress: string) => boolean) | ((clientAddress: string) => Promise<boolean>)  | null | undefined;
  }

  /**
   * Add a rate limiting rule.
   * @param matcher Object describing which events to rate limit
   * @param numRequests Number of requests allowed per time interval (default 10)
   * @param timeInterval Time interval in milliseconds (default 1000)
   * @param callback Optional function called after rule is executed
   * @returns A unique ruleId string
   */
  export function addRule(
    matcher: Matcher,
    numRequests?: number,
    timeInterval?: number,
    callback?: (
      result: RateLimitResult,
      input: {
        type?: string;
        name?: string;
        userId?: string | null;
        connectionId?: string;
        clientAddress?: string;
      }
    ) => void
  ): string;

  /**
   * Remove a rule by its ID.
   * @param ruleId The ruleId returned from `addRule`
   * @returns True if a rule was removed
   */
  export function removeRule(ruleId: string): boolean;

  /**
   * Set the default error message text when rate limit is exceeded.
   * @param message String or function that returns a string
   */
  export function setErrorMessage(message: string | ((result: RateLimitResult) => string)): void;

  /**
   * Set error message for a specific rule.
   * @param ruleId The ruleId returned from `addRule`
   * @param message String or function that returns a string
   */
  export function setErrorMessageOnRule(ruleId: string, message: string | ((result: RateLimitResult) => string)): void;

  /**
   * Get the error message for a rate limit result.
   */
  export function getErrorMessage(rateLimitResult: RateLimitResult): string;
}

export interface RetryOptions {
  /** Time for initial reconnect attempt (ms). Default: 1000 */
  baseTimeout?: number;
  /** Exponential factor to increase timeout each attempt. Default: 2.2 */
  exponent?: number;
  /** Maximum time between retries (ms). Default: 5 * 60 * 1000 */
  maxTimeout?: number;
  /** Time to wait for the first `minCount` retries (ms). Default: 10 */
  minTimeout?: number;
  /** How many times to reconnect "instantly". Default: 2 */
  minCount?: number;
  /** Factor to randomize retry times by (to avoid retry storms). Default: 0.5 */
  fuzz?: number;
}

/**
 * Retry logic with an exponential backoff.
 */
export class Retry {
  baseTimeout: number;
  exponent: number;
  maxTimeout: number;
  minTimeout: number;
  minCount: number;
  fuzz: number;
  retryTimer: number | null;

  constructor(options?: RetryOptions);

  /** Reset a pending retry, if any. */
  clear(): void;

  /**
   * Calculate how long to wait in milliseconds to retry, based on the retry count.
   * @param count Which retry attempt this is
   * @returns Timeout in milliseconds
   */
  _timeout(count: number): number;

  /**
   * Call `fn` after a delay, based on the retry count.
   * @param count Which retry attempt this is
   * @param fn The function to call after the delay
   * @returns The timeout in milliseconds
   */
  retryLater(count: number, fn: () => void): number;
}

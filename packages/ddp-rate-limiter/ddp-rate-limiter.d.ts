export namespace DDPRateLimiter {
  interface Matcher {
    type?: string | ((type: string) => boolean) | ((type: string) => Promise<boolean>)| undefined;
    name?: string | ((name: string) => boolean) | ((name: string) => Promise<boolean>)| undefined;
    userId?: string | ((userId: string) => boolean) | ((userId: string) => Promise<boolean>)| undefined;
    connectionId?: string | ((connectionId: string) => boolean) | ((connectionId: string) => Promise<boolean>)| undefined;
    clientAddress?: string | ((clientAddress: string) => boolean) | ((clientAddress: string) => Promise<boolean>)| undefined;
  }

  function addRule(
    matcher: Matcher,
    numRequests: number,
    timeInterval: number
  ): string;

  function removeRule(ruleId: string): boolean;
}

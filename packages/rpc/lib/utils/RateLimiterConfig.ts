
export const RateLimiterConfig =
  (type: 'method'| 'subscription', name: string, config: {
      interval: number,
      limit: number
  }) => {
    DDPRateLimiter.addRule({
      type: type,
      name: name,
      clientAddress() {
        return true
      },
      connectionId() {
        return true
      },
      userId() {
        return true
      },
    }, config.limit, config.interval);
  }
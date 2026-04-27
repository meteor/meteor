# DDPRateLimiter

Customize rate limiting for methods and subscriptions to avoid a high load of WebSocket messages in your app.

> Galaxy (Meteor hosting) offers additional App Protection, [read more](https://galaxy-support.meteor.com/en/article/ddos-mitigation-1qb032b/) and try it with our [free plans](https://galaxy-support.meteor.com/en/article/billing-4gyv1p/).

By default, `DDPRateLimiter` is configured with a single rule. This rule
limits login attempts, new user creation, and password resets to 5 attempts
every 10 seconds per connection. It can be removed by calling
`Accounts.removeDefaultRateLimit()`.

To use `DDPRateLimiter` for modifying the default rate-limiting rules,
add the `ddp-rate-limiter` package to your project in your terminal:

```bash
meteor add ddp-rate-limiter
```

<ApiBox name="DDPRateLimiter.addRule" hasCustomExample/>

Custom rules can be added by calling `DDPRateLimiter.addRule`. The rate
limiter is called on every method and subscription invocation.

A rate limit is reached when a bucket has surpassed the rule's predefined
capacity, at which point errors will be returned for that input until the
buckets are reset. Buckets are regularly reset after the end of a time
interval.


Here's an example of defining a rule and adding it into the `DDPRateLimiter`:
```js
// Define a rule that matches login attempts by non-admin users.
const loginRule = {
  // Synchronous matcher
  clientAddress(clientAddress) {
    return clientAddress !== '127.0.0.1';
  },
  type: 'method',
  name: 'login'
};

// Add the rule, allowing up to 5 messages every 1000 milliseconds.
DDPRateLimiter.addRule(loginRule, 5, 1000);
```

### Async Matchers

Starting in Meteor 3.5, `DDPRateLimiter` fully supports asynchronous matchers. Your matchers (`userId`, `clientAddress`, `type`, `name`, `connectionId`) can be `async` functions that return a `Promise<boolean>`.

This is incredibly useful for querying the database to perform complex access control logic:

```js
// Define an async rule matching users who have exhausted their tier limits
const premiumTierRule = {
  // Asynchronous matcher evaluating access limits via DB lookup
  async userId(userId) {
    if (!userId) return true; // Rate limit unauthenticated paths if shared
    const user = await Meteor.users.findOneAsync(userId);
    return user && user.subscriptionTier !== 'premium';
  },
  type: 'method',
  name: 'Users.expensiveOperation'
};

// Add the rule, allowing up to 2 calls every 60000 milliseconds for non-premium
DDPRateLimiter.addRule(premiumTierRule, 2, 60000);
```

> **Performance Note**: While async matchers unlock powerful database checks, keep in mind they are awaited sequentially on the incoming message queue for that connection. Extremely slow database queries in rate limiters can delay message processing. If a matcher `Promise` rejects, the rate limit check will safely fail the invocation as it errors out.

<ApiBox name="DDPRateLimiter.removeRule" />
<ApiBox name="DDPRateLimiter.setErrorMessage" />
<ApiBox name="DDPRateLimiter.setErrorMessageOnRule" />

Allows developers to specify custom error messages for each rule instead of being
limited to one global error message for every rule.
It adds some clarity to what rules triggered which errors, allowing for better UX
and also opens the door for i18nable error messages per rule instead of the
default English error message.

Here is an example with a custom error message:
```js
const setupGoogleAuthenticatorRule = {
  userId(userId) {
    const user = Meteor.users.findOne(userId);
    return user;
  },
  type: 'method',
  name: 'Users.setupGoogleAuthenticator',
};

// Add the rule, allowing up to 1 google auth setup message every 60 seconds
const ruleId = DDPRateLimiter.addRule(setupGoogleAuthenticatorRule, 1, 60000);
DDPRateLimiter.setErrorMessageOnRule(ruleId, function (data) {
  return `You have reached the maximum number of Google Authenticator attempts. Please try again in ${Math.ceil(data.timeToReset / 1000)} seconds.`;
});
```

Or a more simple approach:

```js
const ruleId = DDPRateLimiter.addRule(setupGoogleAuthenticatorRule, 1, 60000);
DDPRateLimiter.setErrorMessageOnRule(ruleId, 'Example as a single string error message');
```

# DDPRateLimiter

Customize rate limiting for methods and subscriptions to avoid a high load of WebSocket messages in your app.

> Galaxy (Meteor hosting) offers additional App Protection, [read more](https://galaxy-guide.meteor.com/protection.html) and try it with our [free 30-day trial](https://www.meteor.com/hosting).

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


Here's example of defining a rule and adding it into the `DDPRateLimiter`:
```js
// Define a rule that matches login attempts by non-admin users.
const loginRule = {
  userId(userId) {
    const user = Meteor.users.findOne(userId);
    return user && user.type !== 'admin';
  },

  type: 'method',
  name: 'login'
};

// Add the rule, allowing up to 5 messages every 1000 milliseconds.
DDPRateLimiter.addRule(loginRule, 5, 1000);

```

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

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
// Rate-limit `login` attempts *before* users are authenticated, scoped per
// client IP. Matchers run synchronously (see the note below), so they may only
// read values already on the invocation — never the database.
const loginRateLimit = {
  type: 'method',
  name: 'login',
  // A function matcher must return `true` for the rule to apply. Including
  // `clientAddress` also scopes the rate-limit bucket per IP address.
  clientAddress() {
    return true;
  },
};

// Allow at most 5 login attempts every 10 seconds, per IP address.
DDPRateLimiter.addRule(loginRateLimit, 5, 10000);

```

::: warning
Rule matchers run **synchronously**, and their return value is not awaited. In
Meteor 3 you therefore cannot read from the database inside a matcher: the
synchronous `findOne` throws on the server, and switching to `findOneAsync` /
`await` does not help. Match only on values already on the invocation:
`type`, `name`, `userId`, `connectionId`, `clientAddress`.

If a rule's logic depends on something like a user's role, perform that check
**inside the method itself** (where you can `await` a database read) — not in
the matcher.
:::

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
// Rate-limit a sensitive method called by authenticated users, scoped per user.
const setupGoogleAuthenticatorRule = {
  // Apply only to logged-in users; `userId` also scopes the bucket per user.
  // (Matchers are synchronous — no database reads.)
  userId(userId) {
    return userId != null;
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

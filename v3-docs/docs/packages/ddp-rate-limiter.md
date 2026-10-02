# ddp-rate-limiter

Protect your Meteor app from abuse by limiting how often clients can call methods or subscribe to publications.

By default, Meteor ships with a single built-in rule that limits login attempts, new user creation, and password resets to **5 attempts every 10 seconds per connection**. `ddp-rate-limiter` lets you add your own rules on top of that baseline.

## Installation

```bash
meteor add ddp-rate-limiter
```

## Basic usage

A rule is an object whose keys are matcher functions (or literal values). A request must match **all** keys in a rule to be counted against it. When a bucket exceeds the allowed count within the time interval, further requests return a rate-limit error until the bucket resets.

```js
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

// Block login attempts from non-localhost IPs to at most 5 per second
const loginRule = {
  clientAddress(addr) {
    return addr !== '127.0.0.1';
  },
  type: 'method',
  name: 'login',
};

DDPRateLimiter.addRule(loginRule, 5, 1000);
```

`addRule(rule, count, interval)` returns a `ruleId` string you can pass to `removeRule` later.

### Matcher fields

| Field | Type | Matches |
|-------|------|---------|
| `type` | `'method'` \| `'subscription'` | Request type |
| `name` | string | Method or subscription name |
| `userId` | string \| null | Logged-in user's `_id`, or `null` for anonymous |
| `clientAddress` | string | Client IP address |
| `connectionId` | string | DDP connection identifier |

Any field can be a **literal value** (equality match) or a **function** that receives the current value and returns `true` to include the request in the bucket.

## Async matchers (Meteor 3.5+)

Starting in Meteor 3.5, matcher functions can be `async`. This unlocks database-backed rules — for example, enforcing per-tier rate limits based on a user's subscription plan:

```js
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { Meteor } from 'meteor/meteor';

const premiumTierRule = {
  async userId(userId) {
    if (!userId) return true; // rate-limit anonymous callers
    const user = await Meteor.users.findOneAsync(userId, {
      fields: { subscriptionTier: 1 },
    });
    return user?.subscriptionTier !== 'premium';
  },
  type: 'method',
  name: 'Users.expensiveOperation',
};

// Allow up to 2 calls per minute for non-premium users
DDPRateLimiter.addRule(premiumTierRule, 2, 60_000);
```

You can combine async and synchronous matchers in the same rule — only the async ones are awaited:

```js
const roleBasedRule = {
  type: 'method',
  name: 'Admin.bulkAction',
  async userId(userId) {
    if (!userId) return true;
    const user = await Meteor.users.findOneAsync(userId, { fields: { roles: 1 } });
    return !user?.roles?.includes('admin');
  },
};

DDPRateLimiter.addRule(roleBasedRule, 10, 60_000);
```

:::warning Performance
Async matchers are awaited sequentially for each incoming DDP message on a connection. A slow database query in a matcher delays all subsequent messages for that client. Keep matchers fast — use indexed fields and avoid unbounded queries.

If a matcher `Promise` rejects, the rate-limit check fails the invocation with an error rather than silently allowing it through.
:::

## Custom error messages

By default all rate-limit errors use the same generic message. `setErrorMessageOnRule` lets you return a dynamic string — useful for telling the client how long to wait:

```js
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

const ruleId = DDPRateLimiter.addRule(
  { type: 'method', name: 'Users.sendVerificationEmail' },
  1,
  30_000,
);

DDPRateLimiter.setErrorMessageOnRule(ruleId, ({ timeToReset }) =>
  `Please wait ${Math.ceil(timeToReset / 1000)} seconds before requesting another email.`
);
```

Or pass a plain string for a static message:

```js
DDPRateLimiter.setErrorMessageOnRule(ruleId, 'Too many requests. Try again shortly.');
```

`setErrorMessage` sets the fallback message used by rules that do not have a per-rule message:

```js
DDPRateLimiter.setErrorMessage('Rate limit exceeded. Please slow down.');
```

## Removing the default login rule

Meteor's built-in rule is added by `accounts-base`. To remove it:

```js
import { Accounts } from 'meteor/accounts-base';

Accounts.removeDefaultRateLimit();
```

Call this before adding your own login rule if you want full control over the limit.

## API reference

See the full [DDPRateLimiter API reference](/api/DDPRateLimiter) for detailed parameter types and return values.

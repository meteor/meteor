# accounts-express

Express middleware and authenticated fetch helpers for Meteor accounts.

This package bridges Meteor's account system with Express routes, letting you authenticate HTTP/REST requests using the same login tokens that power DDP. It also enhances `Meteor.fetch` and `import { fetch } from 'meteor/fetch'` with opt-in authentication and exposes an auth-on-by-default `fetch` from `meteor/accounts-express` for server-to-server and client-to-server requests.

## Installation

```bash
meteor add accounts-express
```

This package requires `accounts-base` (implied automatically) and works alongside any login provider (`accounts-password`, `accounts-google`, etc.).

## Auth Middleware {#auth-middleware}

`createAuthMiddleware` creates Express middleware that authenticates incoming requests using Meteor login tokens. Tokens are read from two sources, in order of priority:

1. `Authorization: Bearer <token>` header
2. `meteor_login_token` cookie

```js
import { createAuthMiddleware } from 'meteor/accounts-express';
import { WebApp } from 'meteor/webapp';

// Required authentication — returns 401 for unauthenticated requests
WebApp.handlers.use('/api/protected', createAuthMiddleware({ required: true }));

WebApp.handlers.get('/api/protected', (req, res) => {
  // req.userId is set by the middleware
  // Meteor.userId() also works inside this handler
  res.json({ userId: req.userId });
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `required` | `boolean` | `false` | When `true`, unauthenticated or invalid requests receive a 401 response. When `false`, the request continues with `userId` set to `null`. |

### Optional Authentication

When `required` is `false`, the middleware lets all requests through. You can use this to serve different content based on whether a user is logged in:

```js
WebApp.handlers.get(
  '/api/feed',
  createAuthMiddleware({ required: false }),
  (req, res) => {
    if (req.userId) {
      // personalized feed
    } else {
      // public feed
    }
  }
);
```

### Stacking with Other Middleware

The auth middleware works as a standard Express middleware and can be composed with routers or other middleware:

```js
const apiRouter = WebApp.express.Router();
apiRouter.use(createAuthMiddleware({ required: true }));

apiRouter.get('/me', (req, res) => {
  res.json({ userId: Meteor.userId() });
});

apiRouter.post('/data', (req, res) => {
  // all routes on this router are protected
  res.json({ saved: true });
});

WebApp.handlers.use('/api', apiRouter);
```

## Authenticated Fetch {#authenticated-fetch}

When `accounts-express` is added to your project, three fetch entry points become available. They share the same options (`auth`, `token`), but differ in their default behavior.

| Entry point | Default | When to reach for it |
|-------------|---------|----------------------|
| `Meteor.fetch` | `auth: false` (opt-in) | A neutral fetch that becomes auth-aware when you pass `auth: true` (or `token` on the server). |
| `import { fetch } from 'meteor/fetch'` | `auth: false` (opt-in) | A generic fetch shim. Stays neutral by default so installing `accounts-express` doesn't silently start attaching the user's token to arbitrary URLs. |
| `import { fetch } from 'meteor/accounts-express'` | `auth: true` (opt-out) | The auth-on-by-default fetch. Attaches the login token automatically, just like the rest of the accounts-express surface. Pass `auth: false` to opt out for a single call. |

The asymmetry is deliberate: importing from `meteor/accounts-express` *is* the opt-in. The other two entry points are shared with non-auth code paths and stay neutral until you ask for auth.

### auth-on-by-default fetch

```js
import { fetch } from 'meteor/accounts-express';

// Client: automatically includes the logged-in user's token
const response = await fetch('/api/protected');
const data = await response.json();
```

```js
// Server: inside an authenticated endpoint handler, the token
// is automatically forwarded from the current request context
import { fetch } from 'meteor/accounts-express';

WebApp.handlers.get(
  '/api/proxy',
  createAuthMiddleware({ required: true }),
  async (req, res) => {
    const inner = await fetch(Meteor.absoluteUrl('api/other'));
    const data = await inner.json();
    res.json(data);
  }
);
```

### Meteor.fetch (opt-in)

`Meteor.fetch` is the neutral entry point. Pass `auth: true` to attach the login token, or omit it for a plain fetch.

```js
// No token attached
const publicRes = await Meteor.fetch('/api/public');

// Token attached
const protectedRes = await Meteor.fetch('/api/protected', { auth: true });
```

### fetch from meteor/fetch (opt-in)

Passing `auth: true` or `token` makes `fetch` from `meteor/fetch` delegate through `Meteor.fetch` and pick up the same authentication behavior. Without those options it uses the raw fetch (no auth).

```js
import { fetch } from 'meteor/fetch';

const res = await fetch('/api/protected', { auth: true });
const publicRes = await fetch('/api/public');
```

### Options

| Option | Type | Default | Where | Description |
|--------|------|---------|-------|-------------|
| `auth` | `boolean` | `false` for `Meteor.fetch` and `meteor/fetch`; `true` for `fetch` from `meteor/accounts-express` | Client & Server | When truthy, attach the login token via the `Authorization: Bearer` header. |
| `token` | `string` | — | Server only | Explicit token to use instead of reading from context. Implies `auth: true` unless `auth: false` is set explicitly. Ignored on the client. |

### Skipping Authentication

Pass `auth: false` to skip the token even when calling the auth-on-by-default `fetch`:

```js
import { fetch } from 'meteor/accounts-express';

const response = await fetch('/api/public-endpoint', { auth: false });
```

### Using an Explicit Token (Server)

On the server, you can provide a specific token rather than relying on the automatic context:

```js
const response = await Meteor.fetch(Meteor.absoluteUrl('api/protected'), {
  token: someUserToken,
});
```

### HttpOnly Cookies

The client and server must both have HttpOnly cookies enabled. Call `Accounts.config({ useHttpOnlyCookies: true })` from shared code, or set `Meteor.settings.public.packages.accounts.useHttpOnlyCookies` to `true`.

When enabled, the server handles the following endpoints. When disabled, these
paths fall through to later WebApp handlers.

| Endpoint                        | Requirements and responses                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /_accounts/cookie/set`    | Requires a trusted application origin, `Content-Type: application/json`, a body of at most 4 KB, and a valid, unexpired login token. Invalid tokens return `401`; oversized bodies return `413`. |
| `GET /_accounts/cookie/refresh` | Rejects explicitly cross-site requests. An invalid or expired cookie is cleared and returns `401` with `{ "error": "invalid_cookie" }`.                                                          |
| `POST /_accounts/cookie/clear`  | Requires a trusted application origin and clears the login cookie.                                                                                                                               |

The origin of `ROOT_URL` and the request `Host` are trusted automatically. Add
other trusted origins and tune the per-client-address rate limit from server
code:

```js
Accounts.config({
  useHttpOnlyCookies: true,
  httpOnlyCookieAllowedOrigins: ["https://app.example.com"],
  httpOnlyCookieRateLimit: { max: 60, windowMs: 10_000 },
});
```

All three endpoints allow 30 requests per 10 seconds per client address by
default and return `429` with `{ "error": "rate_limited" }` when that limit is
exceeded. Set `httpOnlyCookieRateLimit: false` to disable this separate endpoint
limit. Behind a reverse proxy, configure `HTTP_FORWARDED_COUNT` so the server
uses the actual client address.

::: warning SameSite migration
The `meteor_login_token` cookie uses `SameSite=Strict`. A browser does not send
it on the initial top-level navigation from another site. Apps that authenticate
that first request with the cookie, including cookie-protected
`accounts-express` routes, must adapt their entry flow. An allowed origin does
not override browser SameSite policy.
:::

On the client, the auth path also sets `credentials: 'include'` so the browser sends the `meteor_login_token` cookie. If you provide your own `credentials` option, it is not overridden. The credentials handling only kicks in when auth is on, so calling `Meteor.fetch(url)` (auth off by default) does not change credentials behavior.

Passing `auth: false` disables both the `Authorization` Bearer header and the automatic `credentials: 'include'` behavior.

## TypeScript

When `accounts-express` is installed, TypeScript definitions are augmented for `Meteor.fetch` and `meteor/fetch` to include the `auth` and `token` options. The `meteor/accounts-express` module also exposes its own typed `fetch`:

```ts
// Meteor.fetch and meteor/fetch: opt-in auth
await Meteor.fetch(url, { auth: true });
await Meteor.fetch(url, { token: 'my-token' }); // server only

import { fetch as packageFetch } from 'meteor/fetch';
await packageFetch(url, { auth: true });

// meteor/accounts-express fetch: auth on by default
import { fetch } from 'meteor/accounts-express';
await fetch(url);                 // auth attached
await fetch(url, { auth: false }); // opt out
```

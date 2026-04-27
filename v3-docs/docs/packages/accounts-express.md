# accounts-express

Express middleware and authenticated fetch helpers for Meteor accounts.

This package bridges Meteor's account system with Express routes, letting you authenticate HTTP/REST requests using the same login tokens that power DDP. It also enhances `Meteor.fetch` and `import { fetch } from 'meteor/fetch'` with automatic token injection, so server-to-server and client-to-server requests carry authentication transparently.

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

When `accounts-express` is added to your project, both `Meteor.fetch` and `import { fetch } from 'meteor/fetch'` are enhanced with authentication support.

### Meteor.fetch

`Meteor.fetch` automatically injects the user's login token into outgoing requests via the `Authorization: Bearer` header. This happens by default — no extra options needed.

```js
// Client: automatically includes the logged-in user's token
const response = await Meteor.fetch('/api/protected');
const data = await response.json();
```

```js
// Server: inside an authenticated endpoint handler, the token
// is automatically forwarded from the current request context
WebApp.handlers.get(
  '/api/proxy',
  createAuthMiddleware({ required: true }),
  async (req, res) => {
    // Meteor.fetch reads the token from the current endpoint context
    const inner = await Meteor.fetch(Meteor.absoluteUrl('api/other'));
    const data = await inner.json();
    res.json(data);
  }
);
```

### fetch from meteor/fetch

When you pass `auth` or `token` options, `fetch` from `meteor/fetch` delegates through `Meteor.fetch` and gets the same authentication behavior. Without those options, it uses the raw fetch directly (no auth injected).

```js
import { fetch } from 'meteor/fetch';

// With auth: true — delegates to Meteor.fetch, token is injected
const res = await fetch('/api/protected', { auth: true });

// Without auth option — uses raw fetch, no token injected
const publicRes = await fetch('/api/public');
```

### Options

| Option | Type | Default | Where | Description |
|--------|------|---------|-------|-------------|
| `auth` | `boolean` | `true` for `Meteor.fetch`, opt-in for `fetch` from `meteor/fetch` | Client & Server | For `Meteor.fetch`, the token is injected by default (pass `auth: false` to skip). For `fetch` from `meteor/fetch`, the auth wrapper only runs when `auth` or `token` is explicitly provided. |
| `token` | `string` | — | Server only | Explicit token to use instead of reading from context. Ignored on the client. |

### Skipping Authentication

Pass `auth: false` to make a request without the token, even when a user is logged in:

```js
const response = await Meteor.fetch('/api/public-endpoint', { auth: false });
```

### Using an Explicit Token (Server)

On the server, you can provide a specific token rather than relying on the automatic context:

```js
const response = await Meteor.fetch(Meteor.absoluteUrl('api/protected'), {
  token: someUserToken,
});
```

### HttpOnly Cookies

On the client, when HttpOnly cookies are enabled (`Accounts.config({ useHttpOnlyCookies: true })`), `Meteor.fetch` automatically sets `credentials: 'include'` so the browser sends the `meteor_login_token` cookie. If you provide your own `credentials` option, it is not overridden.

Passing `auth: false` disables both the `Authorization` Bearer header and the automatic `credentials: 'include'` behavior, so the `meteor_login_token` cookie won't be sent either.

## TypeScript

When `accounts-express` is installed, TypeScript definitions are augmented for both `Meteor.fetch` and `meteor/fetch` to include the `auth` and `token` options:

```ts
// Meteor.fetch accepts MeteorFetchOptions
await Meteor.fetch(url, { auth: false });
await Meteor.fetch(url, { token: 'my-token' }); // server only

// fetch from meteor/fetch also accepts these when accounts-express is loaded
import { fetch } from 'meteor/fetch';
await fetch(url, { auth: true });
```

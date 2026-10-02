# accounts-express

Express middleware and authenticated fetch helpers for Meteor accounts.

This package bridges Meteor's account system with Express routes, letting you authenticate HTTP/REST requests using the same session tokens that power DDP. Routes can also opt into separate API tokens for integrations and automation. It enhances `Meteor.fetch` and `import { fetch } from 'meteor/fetch'` with opt-in authentication and exposes an auth-on-by-default `fetch` from `meteor/accounts-express` for server-to-server and client-to-server requests.

## Installation

```bash
meteor add accounts-express
```

This package requires `accounts-base` (implied automatically) and works alongside any login provider (`accounts-password`, `accounts-google`, etc.).

## Auth Middleware {#auth-middleware}

`createAuthMiddleware` creates Express middleware that authenticates incoming requests using Meteor session tokens. Tokens are read from two sources, in order of priority:

1. `Authorization: Bearer <token>` header
2. `meteor_login_token` cookie

API tokens require the `apiTokens` option and are accepted only from Bearer headers.

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
| `apiTokens` | `boolean \| { scopes: string[] }` | `false` | Set to `true` to accept unrestricted API tokens, or declare a nonempty array of scopes required from API tokens. See [API token route permissions](#api-token-permissions). |

Authenticated requests expose `req.userId` and `req.auth`. Session credentials produce `{ type: 'session' }`; API credentials produce `{ type: 'apiToken', tokenId, scopes }`. The same auth descriptor is available as `auth` in the endpoint invocation context. It contains no raw token. `Meteor.userId()` and `Meteor.userAsync()` identify the owning user for either credential type.

### Optional Authentication

When `required` is `false`, requests without valid credentials continue anonymously. You can use this to serve different content based on whether a user is logged in:

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

If API tokens are enabled, a valid token that does not meet the route's scope requirements still receives HTTP 403, even with `required: false`.

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

## Password Login and Logout {#password-login-and-logout}

With `accounts-password` installed, you can expose password login and session logout through HTTP:

```bash
meteor add accounts-password
```

### Using settings.json {#rest-settings}

To mount the endpoints automatically, add the following to your `settings.json`:

```json
{
  "packages": {
    "accounts-express": {
      "rest": {
        "enabled": true,
        "loginPath": "/auth/login",
        "logoutPath": "/auth/logout"
      }
    }
  }
}
```

Then start your app with:

```bash
meteor --settings settings.json
```

This is a server configuration: put it under `packages`, outside `public`.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Set to `true` to mount login and logout at server startup. Requires `accounts-password`. |
| `loginPath` | `string` | `'/login'` | Exact path for password login. |
| `logoutPath` | `string` | `'/logout'` | Exact path for session logout. |

Paths must be distinct and begin with a single `/`, without whitespace, backslashes, a query string, or a fragment. They are literal paths, not Express route patterns. Paths are relative to the application root: if `ROOT_URL` is `https://example.com/my-app`, configure `/auth/login` to serve `https://example.com/my-app/auth/login`.

The settings are read once at server startup. Invalid settings fail at startup, as does enabling the endpoints without `accounts-password`.

Automatic setup parses JSON only for login requests with `Content-Type: application/json`, using Express's default `100kb` body limit. Use the middleware functions below when you need your own parser, rate limiting, origin checks, or control over middleware ordering.

Use the existing `Accounts.config` options to set session lifetime and enable HttpOnly cookies. API token permissions are configured separately on each route with `createAuthMiddleware`.

### Using Middleware {#rest-middleware}

You can also mount the endpoints from server code. Leave automatic setup disabled when using this approach:

```js
import { WebApp } from 'meteor/webapp';
import { createLoginMiddleware, createLogoutMiddleware } from 'meteor/accounts-express';

WebApp.handlers.use(WebApp.express.json());
WebApp.handlers.use(createLoginMiddleware({ path: '/auth/login' }));
WebApp.handlers.use(createLogoutMiddleware({ path: '/auth/logout' }));
```

The middleware `path` option defaults to `/login` or `/logout` and is relative to a router's mount point. Both setup methods match only `POST` requests on the exact configured path, ignoring the query string. Other requests continue to the next middleware.

### Requests and Responses

Login accepts JSON `{ email, password, code? }` or `{ username, password, code? }` and returns `{ id, token, tokenExpires }`. The password and optional code must be strings. Login uses the same password check, password length limit, and case-insensitive account lookup as DDP. If the user has two-factor authentication enabled through `accounts-2fa`, the request must include a valid one-time `code`.

For example, with the paths configured above:

```bash
curl -X POST https://app.example.com/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"your-password"}'
```

The returned token is a normal session token: it works for HTTP authentication and DDP resume, and uses the configured Accounts session lifetime.

Logout accepts a session token through a Bearer header or the `meteor_login_token` cookie. It revokes that token, runs `onLogout`, and returns `{ message: 'Logged out' }`. Other session tokens remain valid. A missing, invalid, or expired token returns HTTP 401.

If HttpOnly cookies are enabled, REST login sets the session cookie with `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS; logout clears it. Both preserve other cookies set by application middleware. API tokens have their own creation and revocation helpers below.

Malformed login fields return HTTP 400. Invalid credentials return HTTP 401 without revealing whether the account exists; missing or invalid two-factor codes also return HTTP 401. These responses contain `{ error }`. JSON parser errors use Express's error handling.

### Login Hooks

HTTP login uses the Accounts login flow: `validateLoginAttempt` runs before token issuance, followed by `onLogin` for an allowed login or `onLoginFailure` for a rejected attempt. Hook callbacks receive:

- `connection: null`, since the request has no persistent DDP connection.
- `methodName: 'rest-login'` and the REST arguments, with the password omitted.
- A user document filtered by `Accounts.config({ defaultFieldSelector })`, when the user is known.

Inside `onLogin`, `Meteor.userId()` and `Meteor.userAsync()` resolve the authenticated user, including across asynchronous work. Validation and failure hooks run in an anonymous endpoint context.

Use `Meteor.Error` for intentional client-visible rejection from a validation hook. For example, `throw new Meteor.Error(403, 'Account access is disabled')` returns HTTP 403. Unexpected plain errors propagate to Express's error handling instead of being returned as credential errors.

## API Tokens {#api-tokens}

Create API tokens for CI jobs, integrations, or other HTTP clients that need credentials separate from a user's login session. Tokens belong to a Meteor user and are stored hashed under that user's `services.apiTokens`.

### Create a Token

`Accounts.createApiTokenAsync(userId, options)` is available on the server. It returns `{ id, name, createdAt, expiresAt, scopes, token }`.

| Option | Required | Description |
|--------|----------|-------------|
| `name` | Yes | A name for the integration or client. Empty or whitespace-only names are rejected. |
| `expiresAt` | Yes | A future `Date`, or explicit `null` for no expiry. API tokens do not use the global session expiry settings. |
| `scopes` | No | An array of permissions assigned to the token; empty or whitespace-only scope names are rejected. Omitted or `null` means unrestricted; `[]` grants no permissions. |

For example, provision a named credential for a CI job that reads reports:

```js
import { Accounts } from 'meteor/accounts-base';

// ciUserId is the existing user account the job will act as.
const credential = await Accounts.createApiTokenAsync(ciUserId, {
  name: 'reports-ci',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  scopes: ['reports:read'],
});
```

Save `credential.token` in the job's secret store when it is created. The raw value is returned only by creation and cannot be recovered by listing tokens. Keep `credential.id` to identify the credential for revocation.

These helpers are trusted server APIs. Your application must authorize any caller of a management method, UI, or HTTP route that you build around them. Installing the package does not expose token management through HTTP or DDP automatically.

### Route Permissions {#api-token-permissions}

Enable API tokens on each route that should accept them and declare the scopes that route requires:

```js
import { Mongo } from 'meteor/mongo';
import { WebApp } from 'meteor/webapp';
import { createAuthMiddleware } from 'meteor/accounts-express';

const Reports = new Mongo.Collection('reports');

WebApp.handlers.get(
  '/api/reports',
  createAuthMiddleware({
    required: true,
    apiTokens: { scopes: ['reports:read'] },
  }),
  async (req, res) => {
    // The token scope permits this operation; ownership limits its resources.
    const reports = await Reports.find({ ownerId: req.userId }).fetchAsync();
    res.json(reports);
  },
);
```

The CI job sends its saved credential in the Authorization header:

```bash
curl -H "Authorization: Bearer $REPORTS_API_TOKEN" https://app.example.com/api/reports
```

`apiTokens` controls API credentials as follows:

| Value | Behavior |
|-------|----------|
| `false` or omitted | API credentials are treated as unauthenticated: HTTP 401 when `required: true`, otherwise the request continues anonymously. |
| `true` | Accepts unrestricted API tokens. A scoped token receives HTTP 403 because the route has not declared which permissions it requires. |
| `{ scopes: ['reports:read'] }` | Requires a nonempty array of scopes. Accepts unrestricted tokens or scoped tokens that contain **every** required permission. A valid token with insufficient scopes receives HTTP 403, even for optional authentication. |

Scope names must be nonempty strings and cannot consist only of whitespace. Invalid `apiTokens` options, including an empty required-scope array, throw a `TypeError` when `createAuthMiddleware` is called.

Session tokens retain their normal user authentication behavior regardless of this option. API scopes restrict the credential's permitted operations; they do not replace application authorization or grant the owning user access to other users' resources.

API tokens are accepted only as Bearer credentials. They cannot resume a DDP session or authenticate through the `meteor_login_token` cookie.

### List and Revoke Tokens

The following server helpers manage a user's credentials:

| Helper | Result |
|--------|--------|
| `Accounts.listApiTokensAsync(userId)` | An array of `{ id, name, createdAt, expiresAt, scopes }` metadata, including expired entries for management. Neither token values nor hashes are returned. |
| `Accounts.revokeApiTokenAsync(userId, id)` | `true` if that user's token was removed, or `false` if it was absent. |
| `Accounts.revokeAllApiTokensAsync(userId)` | Removes all API tokens for that user. |

```js
const tokens = await Accounts.listApiTokensAsync(ciUserId);

// Revoke the specific credential created above; other tokens remain valid.
const revoked = await Accounts.revokeApiTokenAsync(ciUserId, credential.id);

// Revoke every API credential when the application's workflow requires it.
await Accounts.revokeAllApiTokensAsync(ciUserId);
```

API token lifetime is independent of session lifetime. Session logout, logout of other clients, and password changes or resets do not automatically revoke API tokens. Call the appropriate revocation helper explicitly when an application workflow should also remove API access.

## Authenticated Fetch {#authenticated-fetch}

When `accounts-express` is added to your project, three fetch entry points become available. They share the same options (`auth`, `token`), but differ in their default behavior.

| Entry point | Default | When to reach for it |
|-------------|---------|----------------------|
| `Meteor.fetch` | `auth: false` (opt-in) | A neutral fetch that becomes auth-aware when you pass `auth: true` (or `token` on the server). |
| `import { fetch } from 'meteor/fetch'` | `auth: false` (opt-in) | A generic fetch shim. Stays neutral by default so installing `accounts-express` doesn't silently start attaching the user's token to arbitrary URLs. |
| `import { fetch } from 'meteor/accounts-express'` | `auth: true` (opt-out) | Attaches the current credential automatically. Pass `auth: false` to opt out for a single call. |

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

On the server, implicit forwarding is restricted to URLs with the same origin as the application. The forwarded credential is the same session or API token received by the current request. The receiving route validates it again, including its own API token opt-in and scope requirements; forwarding does not turn an API token into a session token or expand its permissions.

### Meteor.fetch (opt-in)

`Meteor.fetch` is the neutral entry point. Pass `auth: true` to attach the current credential, or omit it for a plain fetch.

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
| `auth` | `boolean` | `false` for `Meteor.fetch` and `meteor/fetch`; `true` for `fetch` from `meteor/accounts-express` | Client & Server | When truthy, attach the current credential via the `Authorization: Bearer` header. |
| `token` | `string` | — | Server only | Explicit token to use instead of reading from context. Implies `auth: true` unless `auth: false` is set explicitly. Ignored on the client. |

### Skipping Authentication

Pass `auth: false` to skip the token even when calling the auth-on-by-default `fetch`:

```js
import { fetch } from 'meteor/accounts-express';

const response = await fetch('/api/public-endpoint', { auth: false });
```

### Using an Explicit Token (Server)

On the server, you can provide a specific session or API token rather than relying on the automatic context:

```js
const response = await Meteor.fetch(Meteor.absoluteUrl('api/protected'), {
  token: someUserToken,
});
```

An explicit token is not restricted to same-origin URLs. For an API token, the target route must enable API credentials and accept its scopes.

### HttpOnly Cookies

HttpOnly cookie authentication is for session tokens. API tokens are not accepted by the cookie endpoints.

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

`httpOnlyCookieAllowedOrigins` and `httpOnlyCookieRateLimit` apply to these
`/_accounts/cookie/*` endpoints. To apply origin checks or rate limits to REST
login and logout, add them when [mounting the middleware](#rest-middleware).

::: warning SameSite migration
The `meteor_login_token` cookie set by `/_accounts/cookie/set` uses
`SameSite=Strict`. A browser does not send
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

The package exports `AuthMiddlewareOptions`, `RequestAuth`, and `RestEndpointMiddlewareOptions` for typed middleware and request handling. Use `RestApiSettings` for objects that configure automatic REST setup:

```ts
import type { RestApiSettings } from 'meteor/accounts-express';

const rest: RestApiSettings = {
  enabled: true,
  loginPath: '/auth/login',
  logoutPath: '/auth/logout',
};
```

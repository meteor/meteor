# accounts-express
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/accounts-express) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/accounts-express)
***

Express middleware and authenticated `fetch` helpers for Meteor accounts. Authenticate HTTP requests with the same session tokens that DDP uses, or explicitly enable separate API tokens for integrations and automation.

## What you get

- `createAuthMiddleware([options])` — Express middleware that resolves a session token from the `Authorization: Bearer` header or the `meteor_login_token` cookie, or an API token when enabled, and exposes `req.userId` and `req.auth`. Inside `next()`, `Meteor.userId()` / `Meteor.userAsync()` work via the current endpoint invocation context.
- A wrapped `Meteor.fetch` (and `fetch` from `meteor/fetch`) that understands `auth: true` and, on the server, `token: '...'`. When `auth` is on, the current credential is attached as a Bearer header.
- `fetch` exported from `meteor/accounts-express` — same as above but auth-on-by-default. Pass `auth: false` to opt out.
- `createLoginMiddleware` and `createLogoutMiddleware` — password login and session logout using the existing Accounts login flow.
- Server-only `Accounts` helpers for creating, listing, and revoking named API tokens with their own expiry and optional scopes.

## Installation

```sh
meteor add accounts-express
```

This package implies `accounts-base` and depends on `webapp` on the server.

## Server: protecting an Express route

```js
import express from "express";
import { Meteor } from "meteor/meteor";
import { WebApp } from "meteor/webapp";
import { createAuthMiddleware } from "meteor/accounts-express";

const app = express();

// required: true → 401 when no/invalid/expired token
// required: false (default) → req.userId is null and the request continues
app.use("/api", createAuthMiddleware({ required: true }));

app.get("/api/me", async (req, res) => {
  const user = await Meteor.userAsync();
  res.json({ userId: req.userId, email: user?.emails?.[0]?.address });
});

WebApp.handlers.use(app);
```

Token resolution order:

1. `Authorization: Bearer <token>` header
2. `meteor_login_token` cookie

Session tokens are validated against `Meteor.users.services.resume.loginTokens` using the Accounts session lifetime. Expired or unknown tokens behave according to the `required` flag. API tokens require an explicit `apiTokens` option and are accepted only from Bearer headers.

## Password login and session logout

Add `accounts-password` to use the password login endpoint:

```sh
meteor add accounts-password
```

```js
import { WebApp } from "meteor/webapp";
import { createLoginMiddleware, createLogoutMiddleware } from "meteor/accounts-express";

WebApp.handlers.use(WebApp.express.json());
WebApp.handlers.use(createLoginMiddleware({ path: "/auth/login" }));
WebApp.handlers.use(createLogoutMiddleware({ path: "/auth/logout" }));
```

`POST /auth/login` accepts `{ email, password, code? }` or `{ username, password, code? }` and returns `{ id, token, tokenExpires }`. It shares DDP's password checking, case-insensitive account lookup, and two-factor authentication checks. When `accounts-2fa` is enabled for the user, provide the one-time code in `code`.

Login runs `validateLoginAttempt`, followed by `onLogin` or `onLoginFailure`. Hooks receive `connection: null`, `methodName: "rest-login"`, and REST arguments with the password omitted. `Meteor.userId()` and `Meteor.userAsync()` reflect the authenticated user inside `onLogin`; validation and failure hooks run in an anonymous endpoint context. Hook user documents respect `Accounts.config({ defaultFieldSelector })`.

Use `Meteor.Error` for intentional client-visible hook rejections; a `403` rejection produces HTTP 403. Unexpected plain errors are passed to Express's error handling. Invalid credentials produce HTTP 401 without revealing whether the account exists.

`POST /auth/logout` authenticates and revokes the current session token. When HttpOnly cookies are enabled, login sets the session cookie and logout clears it. These endpoints do not create or revoke API tokens.

## API tokens

API tokens belong to a Meteor user but have a separate lifetime from browser and DDP sessions. Create them from trusted server code. Applications must authorize requests to any management UI, method, or route they add; these helpers do not expose management endpoints automatically.

```js
import { Accounts } from "meteor/accounts-base";

// ciUserId is the account that the CI job will act as.
const credential = await Accounts.createApiTokenAsync(ciUserId, {
  name: "reports-ci",
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  scopes: ["reports:read"],
});
```

Creation returns `{ id, name, createdAt, expiresAt, scopes, token }`. Copy `credential.token` into the CI secret store at creation: the raw token is returned only once and is stored hashed in `services.apiTokens`.

| Creation option | Required | Meaning |
|-----------------|----------|---------|
| `name` | Yes | A name identifying the integration. Empty or whitespace-only names are rejected. |
| `expiresAt` | Yes | A future `Date`, or explicit `null` for no expiry. Session expiry settings do not apply. |
| `scopes` | No | An array of permissions; empty or whitespace-only scope names are rejected. Omitted or `null` means unrestricted; `[]` grants no permissions. |

### Enable API tokens on a route

```js
import { Mongo } from "meteor/mongo";
import { WebApp } from "meteor/webapp";
import { createAuthMiddleware } from "meteor/accounts-express";

const Reports = new Mongo.Collection("reports");

WebApp.handlers.get(
  "/api/reports",
  createAuthMiddleware({
    required: true,
    apiTokens: { scopes: ["reports:read"] },
  }),
  async (req, res) => {
    // Apply the application's resource authorization as well as the token scope.
    const reports = await Reports.find({ ownerId: req.userId }).fetchAsync();
    res.json(reports);
  },
);
```

The CI job sends its secret as a Bearer token:

```sh
curl -H "Authorization: Bearer $REPORTS_API_TOKEN" https://app.example.com/api/reports
```

| `apiTokens` option | API token behavior |
|--------------------|--------------------|
| `false` or omitted | API tokens are unauthenticated: HTTP 401 when `required`, otherwise an anonymous request. |
| `true` | Accepts unrestricted API tokens. Scoped tokens receive HTTP 403 because the route has not declared the permissions it needs. |
| `{ scopes: ["reports:read"] }` | Requires a nonempty array. Accepts unrestricted tokens or tokens containing **every** required scope. Insufficient scopes receive HTTP 403, including when `required: false`. |

Scope names must be nonempty strings and cannot consist only of whitespace. Invalid `apiTokens` options throw a `TypeError` when the middleware is created.

Session tokens keep their existing user authentication behavior with every option. Scopes restrict API credentials; the route still needs to check which resources the user may access.

Authenticated requests expose `req.auth` and the endpoint invocation's `auth`: `{ type: "session" }` or `{ type: "apiToken", tokenId, scopes }`. `req.userId`, `Meteor.userId()`, and `Meteor.userAsync()` identify the owning user for either credential type. The auth metadata does not contain the raw token.

### List and revoke tokens

All management helpers run on the server. Listing includes expired entries so they can still be identified and revoked:

```js
// Metadata only: id, name, createdAt, expiresAt, scopes. No token or hash.
const tokens = await Accounts.listApiTokensAsync(ciUserId);

const revoked = await Accounts.revokeApiTokenAsync(ciUserId, credential.id);
// revoked is true when the user's token was removed, false if it was absent.

await Accounts.revokeAllApiTokensAsync(ciUserId);
```

API tokens cannot resume DDP sessions or authenticate through login cookies. Session logout, logging out other clients, and password changes or resets do not revoke them. Call the revocation helpers explicitly from application workflows that should also revoke API access.

## Authenticated fetch

Loading this package wraps `Meteor.fetch` so it understands two extra options:

| Option | Where | Default | Effect |
|--------|-------|---------|--------|
| `auth` | client + server | `false` | When `true`, attaches the current credential as `Authorization: Bearer …` |
| `token` | server only | — | Explicit token; implies `auth: true` unless `auth: false` is set |

```js
// Opt-in auth via Meteor.fetch
const res = await Meteor.fetch("/api/me", { auth: true });

// Or via the meteor/fetch package
import { fetch as packageFetch } from "meteor/fetch";
await packageFetch("/api/me", { auth: true });

// Auth-on-by-default ergonomic
import { fetch as authFetch } from "meteor/accounts-express";
await authFetch("/api/me");           // auth: true
await authFetch("/public", { auth: false });
```

### Server-side specifics

- Inside an authenticated request handled by `createAuthMiddleware`, calling `auth: true` (without `token`) reuses the current request's session or API token via the endpoint invocation context. This implicit forwarding is restricted to **same-origin** URLs. The receiving route checks the same credential again, including its API token opt-in and scope requirements.
- Pass `token: '...'` to use an explicit token regardless of context.

### Client-side specifics

- `token` is server-only and is stripped on the client.
- When `Accounts._useHttpOnlyCookies` is enabled, `auth: true` also sets `credentials: 'include'` so the browser sends the `meteor_login_token` cookie automatically.

## TypeScript

Type definitions are shipped with the package and augment `meteor/meteor` and `meteor/fetch` so `auth` / `token` show up on `Meteor.fetch` and `fetch` options.

## See also

- [`accounts-base`](https://docs.meteor.com/api/accounts) — the underlying account system
- [`webapp`](https://docs.meteor.com/api/webapp) — Meteor's Express-compatible HTTP server
- [`fetch`](https://docs.meteor.com/api/fetch) — Meteor's universal fetch package

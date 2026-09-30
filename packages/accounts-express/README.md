# accounts-express
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/accounts-express) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/accounts-express)
***

Express middleware and authenticated `fetch` helpers for Meteor accounts. Lets you authenticate plain HTTP requests (REST endpoints, custom Express routes, server-to-server calls) using the same login tokens that DDP already issues — no separate auth layer required.

## What you get

- `createAuthMiddleware([options])` — Express middleware that resolves a Meteor login token from the `Authorization: Bearer` header or the `meteor_login_token` cookie, looks up the user, and exposes `req.userId`. Inside `next()`, `Meteor.userId()` / `Meteor.userAsync()` work via the current endpoint invocation context.
- A wrapped `Meteor.fetch` (and `fetch` from `meteor/fetch`) that understands `auth: true` and, on the server, `token: '...'`. When `auth` is on, the login token is attached as a Bearer header.
- `fetch` exported from `meteor/accounts-express` — same as above but auth-on-by-default. Pass `auth: false` to opt out.

## Installation

```sh
meteor add accounts-express
```

This package implies `accounts-base` and depends on `webapp` on the server.

## Server: protecting an Express route

```js
import express from "express";
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

Tokens are validated against `Meteor.users.services.resume.loginTokens` and checked against `Accounts._getTokenLifetimeMs()`. Expired or unknown tokens behave according to the `required` flag.

## Authenticated fetch

Loading this package wraps `Meteor.fetch` so it understands two extra options:

| Option | Where | Default | Effect |
|--------|-------|---------|--------|
| `auth` | client + server | `false` | When `true`, attaches the login token as `Authorization: Bearer …` |
| `token` | server only | — | Explicit token; implies `auth: true` unless `auth: false` is set |

```js
// Opt-in auth via Meteor.fetch
const res = await Meteor.fetch("/api/me", { auth: true });

// Or via the meteor/fetch package
import { fetch } from "meteor/fetch";
await fetch("/api/me", { auth: true });

// Auth-on-by-default ergonomic
import { fetch } from "meteor/accounts-express";
await fetch("/api/me");           // auth: true
await fetch("/public", { auth: false });
```

### Server-side specifics

- Inside an authenticated request handled by `createAuthMiddleware`, calling `auth: true` (without `token`) reuses the current request's login token via the endpoint invocation context. This implicit forwarding is restricted to **same-origin** URLs, so a handler that fetches a third-party host will not leak the user's token to it.
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

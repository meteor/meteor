# meteor-accounts-better-auth

`meteor-accounts-better-auth` bridges [Better Auth](https://www.better-auth.com/) with Meteor's accounts and DDP model.

It lets you:

- mount Better Auth HTTP endpoints inside a Meteor app
- keep `Meteor.userId()` and method/publication auth in sync with Better Auth sessions
- use Better Auth for email/password flows while still working with Meteor's account-facing APIs

## Status

This package is experimental, but already covers the first useful auth flows:

- sign up
- sign in
- sign out
- resend verification email
- verify email from a token
- request password reset
- reset password
- change password
- restore DDP auth from the Better Auth session cookie on reconnect

## How It Works

On the server, the package:

- mounts Better Auth under `/api/auth` by default
- registers an Accounts session resolver for new DDP connections
- reads the Better Auth signed session cookie from parsed DDP connection cookies
- resolves the Meteor `userId` for that connection
- exposes a Meteor method, `_betterAuth.syncSession`, for post-login and post-logout session syncing
- publishes Better Auth-oriented user fields such as `email`, `emailVerified`, `name`, and `image`

On the client, the package adds helpers to `Accounts` so your app can talk to Better Auth and then synchronize Meteor's connection state.

## Installation

Add the package to `.meteor/packages`:

```text
meteor-accounts-better-auth
```

Install the npm packages your app will use to create the Better Auth server and client:

```bash
npm install better-auth mongodb
```

## Server Setup

Create the Better Auth instance in your Meteor app, then hand it to `Accounts.configureBetterAuth(...)`.

```js
import { Accounts } from "meteor/accounts-base";
import { Random } from "meteor/random";
import Module from "module";

const nativeRequire = Module.createRequire(process.cwd() + "/package.json");
const { betterAuth } = nativeRequire("better-auth");
const { mongodbAdapter } = nativeRequire("better-auth/adapters/mongodb");
const { toNodeHandler } = nativeRequire("better-auth/node");
const { MongoClient } = nativeRequire("mongodb");

const mongoClient = new MongoClient(process.env.MONGO_URL);
const db = mongoClient.db();
const rootUrl = process.env.ROOT_URL || "http://localhost:3000";

const auth = betterAuth({
  database: mongodbAdapter(db, { client: mongoClient }),
  basePath: "/api/auth",
  baseURL: rootUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  advanced: {
    database: {
      generateId: () => Random.id(),
    },
  },
  emailAndPassword: {
    enabled: true,
  },
});

Accounts.configureBetterAuth({
  auth,
  toNodeHandler,
});
```

## Why The Extra MongoClient?

Meteor bundles its own MongoDB driver internally, while Better Auth's Mongo adapter expects the app's npm `mongodb` driver objects.

Using a fresh `MongoClient` created from the app's installed `mongodb` package avoids driver mismatch issues.

## Client Setup

Create a Better Auth client and register it once on the client:

```js
import { Accounts } from "meteor/accounts-base";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
});

Accounts.setBetterAuthClient(authClient);
```

## Client API

This package extends `Accounts` with the following helpers:

- `Accounts.setBetterAuthClient(client)`
- `Accounts.getBetterAuthClient()`
- `Accounts.syncBetterAuthSession(sessionToken)`
- `Accounts.refreshBetterAuthConnection()`
- `Accounts.signInWithBetterAuth(email, password)`
- `Accounts.signUpWithBetterAuth(email, password, name)`
- `Accounts.signOutWithBetterAuth()`
- `Accounts.sendVerificationEmailWithBetterAuth(email)`
- `Accounts.requestPasswordResetWithBetterAuth(email, redirectTo)`
- `Accounts.resetPasswordWithBetterAuth(token, newPassword)`
- `Accounts.changePasswordWithBetterAuth(currentPassword, newPassword, options)`
- `Accounts.verifyEmailWithBetterAuth(token)`

## Server API

The package adds:

- `Accounts.configureBetterAuth({ auth, toNodeHandler, basePath, cookieName })`
- `Accounts.getBetterAuth()`

`Accounts.configureBetterAuth(...)` must be called exactly once on the server.

Options:

- `auth`: required Better Auth instance created by the app
- `toNodeHandler`: optional Better Auth Node handler helper
- `basePath`: optional HTTP mount path, defaults to `/api/auth`
- `cookieName`: optional Better Auth session cookie name, defaults to `better-auth.session_token`

## Published User Fields

The package configures Meteor user publishing so Better Auth-oriented fields are available through `Meteor.user()`:

- `email`
- `emailVerified`
- `emails`
- `image`
- `name`
- `profile`
- `username`

For autopublish-style behavior, it also exposes:

- logged-in user fields: `email`, `emailVerified`, `name`, `image`
- other-user fields: `name`, `image`

## Current Limitations

- This package is experimental.
- Social login, 2FA, and email-change flows are not included yet.
- The package does not create the Better Auth instance for you; the Meteor app owns that setup.

## Notes For Production

- Set a real `BETTER_AUTH_SECRET`.
- Replace dev-console email logging with a real mail transport.
- Use a stable `ROOT_URL`.
- Review Better Auth's cookie, trusted-origin, and deployment settings for your environment.

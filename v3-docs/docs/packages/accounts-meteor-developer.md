# accounts-meteor-developer

The `accounts-meteor-developer` package is the login service that lets users of your app sign in with their [Meteor Developer Account](https://www.meteor.com), using OAuth. It builds on top of [`accounts-base`](../api/accounts.md) and the `meteor-developer-oauth` package, registering the service and exposing a client-side `Meteor.loginWithMeteorDeveloperAccount` helper.

Add it to your project with:

```bash
meteor add accounts-meteor-developer
```

Adding the package automatically implies [`accounts-base`](../api/accounts.md) and `meteor-developer-oauth`, so the `Accounts` API and the underlying `MeteorDeveloperAccounts` OAuth helpers become available as well.

## Configuring the service

Before users can log in, you must register an application with Meteor and configure its credentials in your app. This is handled by the [`service-configuration`](./service-configuration.md) package — see the [OAuth Services Configuration](./service-configuration.md) guide for the full setup, including how to provide credentials through `settings.json`.

If you prefer a step-by-step UI, the [`accounts-ui`](./accounts-ui.md) package presents a guided configuration dialog. If you use `accounts-ui` but have not configured the service through `service-configuration`, the package prints a console notice suggesting you also add the matching configuration UI:

```bash
meteor add meteor-developer-config-ui
```

## Logging in

On the client, the package adds the `Meteor.loginWithMeteorDeveloperAccount` function.

```js
Meteor.loginWithMeteorDeveloperAccount((error) => {
  if (error) {
    // handle the login failure
  } else {
    // successful login
  }
});
```

### `Meteor.loginWithMeteorDeveloperAccount([options], [callback])`

- `options` **Object** _(optional)_ — options passed through to the underlying OAuth request.
- `callback` **Function** _(optional)_ — called with a single `error` argument on failure, or with no arguments on success. A callback may be passed as the first argument when no `options` are needed.

Calling this function starts the OAuth flow with Meteor's developer accounts service. Depending on the configured `loginStyle` (`"popup"` or `"redirect"`, set in the service configuration), it either opens a pop-up window or redirects the page to the authorization page. Once the user authorizes the app, the Meteor client logs in to the server with the returned credentials.

For the generic `Meteor.loginWith<ExternalService>` behavior shared by all OAuth login services, see the [Accounts API documentation](../api/accounts.md#Meteor-loginWith%3CExternalService%3E).

## Setting up the app

Meteor Developer Accounts use the OAuth2 service hosted at `https://www.meteor.com`. You register an application there to obtain a `clientId`/`secret`, and register your redirect URI. Meteor handles the callback at:

```
<your-root-url>/_oauth/meteor-developer
```

e.g. `http://localhost:3000/_oauth/meteor-developer` in development.

> This service is tied to the legacy Meteor Developer Accounts platform; verify it is still available for new registrations before relying on it.

## A complete example

**1. Configure the OAuth credentials** on the server (for example in `server/main.js`). Meteor Developer Accounts use `clientId`/`secret`:

```js
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'meteor-developer' },
  {
    $set: {
      loginStyle: 'popup', // or 'redirect' (use 'redirect' for mobile/Cordova)
      clientId: 'YOUR_CLIENT_ID',
      secret: 'YOUR_CLIENT_SECRET',
    },
  },
);
```

See [OAuth Services Configuration](./service-configuration.md) for the `settings.json` alternative and where to obtain these credentials.

**2. Trigger the login.** With Blaze you can drop in the ready-made widget from [`accounts-ui`](./accounts-ui.md):

```handlebars
{{> loginButtons}}
```

Or call the login function directly from your own button — this works with React, Vue, Svelte, plain JS, etc.:

```js
function signIn() {
  Meteor.loginWithMeteorDeveloperAccount((error) => {
    if (error) {
      // The user closing the popup rejects with Accounts.LoginCancelledError.
      console.error(error);
    }
  });
}
```

**3. Read the signed-in user.** After a successful login the profile and token live under `services.meteor-developer`:

```js
const user = Meteor.user(); // reactive on the client
// user.services['meteor-developer'].id, .username, .accessToken, ...
```

**4. Log out:**

```js
Meteor.logout();
```

## What's stored on the user

After login, data is stored under `services.meteor-developer`: `id`, `username`, identity fields, plus `accessToken` and `expiresAt`. The user's `profile.name` is also set from the identity. If credentials aren't configured, the login throws a `ServiceConfiguration.ConfigError`.

## Server behavior

On the server, `accounts-meteor-developer` registers the `meteor-developer` OAuth service and, when the `autopublish` package is enabled, publishes the following fields of the service data:

- For the logged-in user: the entire `services.meteor-developer` object (including the access token, which can legitimately be used from the client over HTTPS or on localhost).
- For other users: `services.meteor-developer.username`, `services.meteor-developer.profile`, and `services.meteor-developer.id`.

## See also

- [Accounts API](../api/accounts.md) — the core `Accounts` and `Meteor.loginWith<ExternalService>` APIs.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials.
- [accounts-ui](./accounts-ui.md) — drop-in login UI with a configuration wizard.

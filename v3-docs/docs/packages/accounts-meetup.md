# accounts-meetup

The `accounts-meetup` package is the login service that lets users of your app sign in with their Meetup account, using OAuth. It builds on top of [`accounts-base`](../api/accounts.md) and the `meetup-oauth` package, registering Meetup as an available login service and exposing a client-side `Meteor.loginWithMeetup` helper.

Add it to your project with:

```bash
meteor add accounts-meetup
```

Adding the package automatically implies [`accounts-base`](../api/accounts.md) and `meetup-oauth`, so the `Accounts` API and the underlying `Meetup` OAuth helpers become available as well.

## Configuring the service

Before users can log in, you must register an OAuth application with Meetup and configure its credentials in your app. This is handled by the [`service-configuration`](./service-configuration.md) package — see the [OAuth Services Configuration](./service-configuration.md) guide for the full setup, including how to provide credentials through `settings.json`.

If you prefer a step-by-step UI, the [`accounts-ui`](./accounts-ui.md) package presents a guided configuration dialog. If you use `accounts-ui` but have not configured the service through `service-configuration`, the package prints a console notice suggesting you also add the matching configuration UI:

```bash
meteor add meetup-config-ui
```

## Logging in

On the client, the package adds the `Meteor.loginWithMeetup` function.

```js
Meteor.loginWithMeetup(options, (error) => {
  if (error) {
    // handle the login failure
  } else {
    // successful login
  }
});
```

### `Meteor.loginWithMeetup([options], [callback])`

- `options` **Object** _(optional)_ — options passed through to the underlying Meetup OAuth request.
- `callback` **Function** _(optional)_ — called with a single `error` argument on failure, or with no arguments on success. A callback may be passed as the first argument when no `options` are needed.

Calling this function starts the OAuth flow with Meetup. Depending on the configured `loginStyle` (`"popup"` or `"redirect"`, set in the service configuration), it either opens a pop-up window or redirects the page to Meetup's authorization page. Once the user authorizes the app, the Meteor client logs in to the server with the credentials returned by Meetup.

#### Requesting permissions

To request additional permissions (scopes) from the user, pass an array in `options.requestPermissions`:

```js
Meteor.loginWithMeetup({
  requestPermissions: ['ageless', 'basic'],
});
```

When `requestPermissions` is not provided, no extra scopes are requested. The user's `accessToken` is stored in the `services.meetup` field of their user document, so it can be used later to call the Meetup API on their behalf. For the generic `Meteor.loginWith<ExternalService>` behavior shared by all OAuth login services, see the [Accounts API documentation](../api/accounts.md#Meteor-loginWith%3CExternalService%3E).

## Setting up the Meetup app

1. Register an OAuth consumer in your Meetup account's API/OAuth settings.
2. Copy the **Client ID** and **Client Secret** — these are the `clientId` and `secret` you configure below.
3. Register your redirect URI. Meteor handles the callback at:

   ```
   <your-root-url>/_oauth/meetup
   ```

   e.g. `http://localhost:3000/_oauth/meetup` in development.

## A complete example

**1. Configure the OAuth credentials** on the server (for example in `server/main.js`). Meetup uses `clientId`/`secret`:

```js
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'meetup' },
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
  Meteor.loginWithMeetup((error) => {
    if (error) {
      // The user closing the popup rejects with Accounts.LoginCancelledError.
      console.error(error);
    }
  });
}
```

**3. Read the signed-in user.** After a successful login the profile and token live under `services.meetup`:

```js
const user = Meteor.user(); // reactive on the client
// user.services.meetup.id, user.services.meetup.accessToken, ...
```

**4. Log out:**

```js
Meteor.logout();
```

## What's stored on the user

After login, Meetup profile data is stored under `services.meetup`: `id`, `name`, `lang`, `link`, `photo`, `country`, `city`, plus `accessToken` and `expiresAt`. The user's `profile.name` is also set from the Meetup name. Access tokens expire (`expiresAt`); there is no built-in refresh, so don't rely on the stored token long-term.

## Server behavior

On the server, `accounts-meetup` registers the `meetup` OAuth service and, when the `autopublish` package is enabled, publishes the following fields of the Meetup service data:

- For the logged-in user: the entire `services.meetup` object (including the access token, which can legitimately be used from the client over HTTPS or on localhost).
- For other users: `services.meetup.id`.

## See also

- [Accounts API](../api/accounts.md) — the core `Accounts` and `Meteor.loginWith<ExternalService>` APIs.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials.
- [accounts-ui](./accounts-ui.md) — drop-in login UI with a configuration wizard.

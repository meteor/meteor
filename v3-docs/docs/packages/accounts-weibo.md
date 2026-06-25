# accounts-weibo

The `accounts-weibo` package is the login service that lets users of your app sign in with their [Sina Weibo](https://weibo.com) account, using OAuth. It builds on top of [`accounts-base`](../api/accounts.md) and the `weibo-oauth` package, registering Weibo as an available login service and exposing a client-side `Meteor.loginWithWeibo` helper.

Add it to your project with:

```bash
meteor add accounts-weibo
```

Adding the package automatically implies [`accounts-base`](../api/accounts.md) and `weibo-oauth`, so the `Accounts` API and the underlying `Weibo` OAuth helpers become available as well.

## Configuring the service

Before users can log in, you must register an application with Weibo and configure its credentials in your app. This is handled by the [`service-configuration`](./service-configuration.md) package — see the [OAuth Services Configuration](./service-configuration.md) guide for the full setup, including how to provide credentials through `settings.json`.

If you prefer a step-by-step UI, the [`accounts-ui`](./accounts-ui.md) package presents a guided configuration dialog. When you use `accounts-ui` together with `accounts-weibo`, the package will print a console notice suggesting you also add the matching configuration UI:

```bash
meteor add weibo-config-ui
```

## Logging in

On the client, the package adds the `Meteor.loginWithWeibo` function.

```js
Meteor.loginWithWeibo((error) => {
  if (error) {
    // handle the login failure
  } else {
    // successful login
  }
});
```

### `Meteor.loginWithWeibo([options], [callback])`

- `options` **Object** _(optional)_ — options passed through to the underlying Weibo OAuth request.
- `callback` **Function** _(optional)_ — called with a single `error` argument on failure, or with no arguments on success. A callback may be passed as the first argument when no `options` are needed.

Calling this function starts the OAuth flow with Weibo. Depending on the configured `loginStyle` (`"popup"` or `"redirect"`, set in the service configuration), it either opens a pop-up window or redirects the page to Weibo's authorization page. Once the user authorizes the app, the Meteor client logs in to the server with the credentials returned by Weibo.

For the generic `Meteor.loginWith<ExternalService>` behavior shared by all OAuth login services, see the [Accounts API documentation](../api/accounts.md#Meteor-loginWith%3CExternalService%3E). Note that `requestPermissions` is not currently supported for Weibo.

## Server behavior

On the server, `accounts-weibo` registers the `weibo` OAuth service and, when the `autopublish` package is enabled, publishes the following fields of the Weibo service data:

- For the logged-in user: the entire `services.weibo` object (including the access token, which can legitimately be used from the client over HTTPS or on localhost).
- For other users: `services.weibo.screenName`.

## See also

- [Accounts API](../api/accounts.md) — the core `Accounts` and `Meteor.loginWith<ExternalService>` APIs.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials.
- [accounts-ui](./accounts-ui.md) — drop-in login UI with a configuration wizard.

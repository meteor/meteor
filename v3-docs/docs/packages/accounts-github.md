# accounts-github

The `accounts-github` package is the login service that lets users of your app sign in with their GitHub account, using OAuth. It builds on top of [`accounts-base`](../api/accounts.md) and the `github-oauth` package, registering GitHub as an available login service and exposing a client-side `Meteor.loginWithGithub` helper.

Add it to your project with:

```bash
meteor add accounts-github
```

Adding the package automatically implies [`accounts-base`](../api/accounts.md) and `github-oauth`, so the `Accounts` API and the underlying `Github` OAuth helpers become available as well.

## Configuring the service

Before users can log in, you must register an OAuth application with GitHub and configure its credentials in your app. This is handled by the [`service-configuration`](./service-configuration.md) package — see the [OAuth Services Configuration](./service-configuration.md) guide for the full setup, including how to provide credentials through `settings.json`.

If you prefer a step-by-step UI, the [`accounts-ui`](./accounts-ui.md) package presents a guided configuration dialog. When you use `accounts-ui` together with `accounts-github`, the package will print a console notice suggesting you also add the matching configuration UI:

```bash
meteor add github-config-ui
```

## Logging in

On the client, the package adds the `Meteor.loginWithGithub` function.

```js
Meteor.loginWithGithub(options, (error) => {
  if (error) {
    // handle the login failure
  } else {
    // successful login
  }
});
```

### `Meteor.loginWithGithub([options], [callback])`

- `options` **Object** _(optional)_ — options passed through to the underlying GitHub OAuth request.
- `callback` **Function** _(optional)_ — called with a single `error` argument on failure, or with no arguments on success. A callback may be passed as the first argument when no `options` are needed.

Calling this function starts the OAuth flow with GitHub. Depending on the configured `loginStyle` (`"popup"` or `"redirect"`, set in the service configuration), it either opens a pop-up window or redirects the page to GitHub's authorization page. Once the user authorizes the app, the Meteor client logs in to the server with the credentials returned by GitHub.

#### Requesting permissions

To request additional permissions (scopes) from the user, pass an array in `options.requestPermissions`:

```js
Meteor.loginWithGithub({
  requestPermissions: ['user', 'repo'],
});
```

When `requestPermissions` is not provided, `accounts-github` requests the `user:email` scope by default, so that the user's email address is available. The user's `accessToken` is stored in the `services.github` field of their user document, so it can be used later to call the GitHub API on their behalf. The set of supported scope values is defined by GitHub; see [GitHub's OAuth scopes reference](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps). For the generic `Meteor.loginWith<ExternalService>` behavior shared by all OAuth login services, see the [Accounts API documentation](../api/accounts.md#Meteor-loginWith%3CExternalService%3E).

## Server behavior

On the server, `accounts-github` registers the `github` OAuth service and, when the `autopublish` package is enabled, publishes the following fields of the GitHub service data:

- For the logged-in user: the entire `services.github` object.
- For other users: `services.github.username`.

## See also

- [Accounts API](../api/accounts.md) — the core `Accounts` and `Meteor.loginWith<ExternalService>` APIs.
- [OAuth Services Configuration](./service-configuration.md) — configuring OAuth credentials.
- [accounts-ui](./accounts-ui.md) — drop-in login UI with a configuration wizard.

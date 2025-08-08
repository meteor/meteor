# Bundler

Meteor handles linking all project files into the final bundle. While we'd like to offload more of this to a modern bundler, we're still focused on keeping what's left in the Meteor context as fast as possible.

Integration with a modern bundler is in progress for Meteor 3.4. Meanwhile, we've optimized existing processes for better performance.

## Web Arch

:::info
Starting with Meteor 3.3
:::

> Web archs are the builds Meteor generates for modern browsers, legacy browsers, and Cordova.

New apps skip `web.browser.legacy` and `web.cordova` by default in development mode (unless developing for native). This results on getting a faster build process on development mode.

For existing apps, enable this by adding to `package.json`:

```json
"meteor": {
  "modern": true
}
```

This works like using `--exclude-archs web.browser.legacy,web.cordova` with `meteor run`.

By default, `"modern": true` enables all build stack upgrades. To opt out of web arch-only compilation, set `"webArchOnly": false` in your `package.json`.

```json
"meteor": {
  "modern": {
    "webArchOnly": false
  }
}
```

This setting doesn’t affect production; legacy builds are still included by default on Meteor apps.

To exclude legacy builds in production, add "modern" to the `.meteor/platforms` file.

```sh
server
browser
modern
```

## Minifier

:::info
Starting with Meteor 3.3
:::

> The minifier reduces and obfuscates your app’s production bundle for security and efficiency.

New apps use an SWC-based minifier, replacing the legacy [Terser](https://github.com/terser/terser) minifier. This speeds up production builds and deployments.

For existing apps, enable this by adding to `package.json`:

```json
"meteor": {
  "modern": true
}
```

By default, `"modern": true` enables all build stack upgrades. To opt out of the new minifier, set `"minifier": false` in your `package.json`.

```json
"meteor": {
  "modern": {
    "minifier": false
  }
}
```

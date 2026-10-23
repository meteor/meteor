# rspack

Build Meteor apps with Rspack, with hot module replacement in development and optimized client and server bundles for production. Supports Meteor packages, custom configuration, and architecture-specific builds.

## Legacy and architecture-specific entry points

Starting with Meteor 3.6, explicit `meteor.mainModule` entries for `modern`, `legacy` (or `web.browser.legacy`), `web.browser`, and `web.cordova` are compiled separately through the same Rspack configuration. Aliases, loaders, and plugins apply to those entries too. Legacy compilation defaults to ES5 for both application transforms and the Rspack runtime, including Cordova when `modern.cordova` is `false`. `Meteor.arch` and `Meteor.isLegacy` are available in the Rspack configuration callback for architecture-specific adjustments. Explicit `false` disables that entry, while omitted entries retain the existing client fallback.

Select the legacy source in `package.json`, rather than overriding Rspack's `entry` option:

```json
{
  "meteor": {
    "mainModule": {
      "client": "client/main.js",
      "legacy": "client/legacy.js",
      "server": "server/main.js"
    },
    "modern": { "webArchOnly": false }
  }
}
```

The existing `defineConfig(Meteor => ...)` callback runs for each compilation. Use `Meteor.isLegacy` to select legacy-specific settings in that callback; there is no automatically loaded `rspack.legacy.config.js`. With only `mainModule.client`, the shared-client behavior is preserved, so declare `legacy` explicitly when it needs separate configuration. A `testModule.legacy` entry selects separate tests.

Each explicit architecture has its own generated modules, cache, chunks, and assets. In development, those builds use Rspack watch and Meteor reload; the default client keeps Rspack HMR. The normal architecture inclusion settings still apply, so enable legacy with `modern.webArchOnly: false` when testing it in dev.

Dependencies excluded from transpilation and custom compiler rules remain the application's responsibility. Use the existing `compileWithRspack` helper for npm dependencies that need transpilation for the legacy target.

See the [legacy workflow guide](../../v3-docs/docs/about/modern-build-stack/rspack-bundler-integration.md#legacy-and-architecture-specific-entry-points) for conditional configuration, development, builds, and browser testing. ES5 output still requires appropriate runtime APIs and compatible dependencies in the browsers your app supports.

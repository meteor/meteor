# @meteorjs/rspack

The default [Rspack](https://rspack.dev) configuration for Meteor applications. This package provides everything you need to bundle your Meteor app with Rspack out of the box: client and server builds, SWC transpilation, React/Blaze/Angular support, hot module replacement, asset management, and all the Meteor-specific wiring so you don't have to.

When Meteor runs with the Rspack bundler enabled, this package is what generates the underlying Rspack configuration. It detects your project setup (TypeScript, React, Blaze, Angular), sets up the right loaders and plugins, defines `Meteor.isClient`/`Meteor.isServer` and friends, configures caching, and exposes a set of helpers you can use in your own `rspack.config.js` to customize the build without breaking Meteor integration.

## What it provides

- **Dual client/server builds** with the correct targets, externals, and output paths
- **SWC-based transpilation** for JS/TS/JSX/TSX with automatic framework detection
- **React Fast Refresh** in development when React is enabled
- **Blaze template handling** via ignore-loader when Blaze is enabled
- **Persistent filesystem caching** for fast rebuilds
- **Asset externals and HTML generation** through custom Rspack plugins
- **A `defineConfig` helper** that accepts a factory function receiving Meteor environment flags and build utilities
- **Customizable config** via `rspack.config.js` in your project root, with safe merging that warns if you try to override reserved settings

## Installation

[Rspack integration](https://docs.meteor.com/about/modern-build-stack/rspack-bundler-integration.html) is automatically managed by the rspack Atmosphere package.

```bash
meteor add rspack
```

By doing this, your Meteor app will automatically serve `@meteorjs/rspack` and the required `@rspack/cli`, `@rspack/core`, among others.

## Usage

In your project's `rspack.config.js`, use the `defineConfig` helper to customize the build. The factory function receives a `env` object with Meteor environment flags and helper utilities:

```js
const { defineConfig } = require('@meteorjs/rspack');

module.exports = defineConfig((env, argv) => {
  // env.isClient, env.isServer, env.isDevelopment, env.isProduction
  // env.isReactEnabled, env.isBlazeEnabled, etc.

  return {
    // Your custom Rspack configuration here.
    // It gets safely merged with the Meteor defaults.
  };
});
```

More information is available in the official docs: [Rspack Bundler Integration](https://docs.meteor.com/about/modern-build-stack/rspack-bundler-integration.html#custom-rspack-config-js).

## Development

### Install dependencies

```bash
npm install
```

### Version bumping

Use `npm run bump` to update the version in `package.json` before publishing.

```bash
npm run bump -- <major|minor|patch> [--beta]
```

**Standard bumps** increment the version and remove any prerelease suffix:

```bash
npm run bump -- patch   # 1.0.1 -> 1.0.2
npm run bump -- minor   # 1.0.1 -> 1.1.0
npm run bump -- major   # 1.0.1 -> 2.0.0
```

**Beta bumps** append or increment a `-beta.N` prerelease suffix:

```bash
npm run bump -- patch --beta   # 1.0.1 -> 1.0.2-beta.0
npm run bump -- patch --beta   # 1.0.2-beta.0 -> 1.0.2-beta.1
npm run bump -- patch --beta   # 1.0.2-beta.1 -> 1.0.2-beta.2
```

If you change the bump level while on a beta, the base version updates and the beta counter resets:

```bash
npm run bump -- minor --beta   # 1.0.2-beta.2 -> 1.1.0-beta.0
npm run bump -- major --beta   # 1.1.0-beta.0 -> 2.0.0-beta.0
```

### Publishing a beta release

After bumping to a beta version, publish to the `beta` dist-tag:

```bash
npm run bump -- patch --beta
npm run publish:beta
```

Users can then install the beta with:

```bash
npm install @meteorjs/rspack@beta
```

You can pass extra flags to `npm publish` through the script:

```bash
npm run publish:beta -- --dry-run
```

### Publishing an official release

After bumping to a stable version, publish with the default `latest` tag:

```bash
npm run bump -- patch
npm publish
```

### Typical workflows

**Beta iteration**: ship multiple beta builds for the same upcoming patch:

```bash
npm run bump -- patch --beta    # 1.0.1 -> 1.0.2-beta.0
npm run publish:beta
# ... fix issues ...
npm run bump -- patch --beta    # 1.0.2-beta.0 -> 1.0.2-beta.1
npm run publish:beta
```

**Promote beta to stable**: once the beta is ready, bump to the stable version and publish:

```bash
npm run bump -- patch           # 1.0.2-beta.1 -> 1.0.3
npm publish
```

**Direct stable release**: skip the beta phase entirely:

```bash
npm run bump -- minor           # 1.0.1 -> 1.1.0
npm publish
```

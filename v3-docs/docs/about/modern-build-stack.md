---
outline:
  level: [2, 3]
---

# Modern Build Stack

**Meteor’s modern build stack** delivers better speed and productivity, plus new features and plugins that follow current bundler standards.

**Two major overhauls** make this possible:

1. **Meteor Bundler Optimizations.** Meteor builds the final bundle with Atmosphere packages built in and Meteor specifics. We reviewed key components to get the most performance gains and speed up builds and the dev experience, mainly with SWC integration.

2. **Rspack Bundler Integration.** Rspack bundles your app code only. Meteor Bundler then builds the final bundle, preserving compatibility with Meteor specifics like Atmosphere packages. We reviewed Meteor Bundler to ensure it delegates app code to Rspack, unlocking more speed, tree shaking, full ESM support, and compatibility with standard plugins and modern project configurations.

## Quick start

**New Meteor apps enable the modern build stack by default**, with both **Meteor Bundler optimizations** and **Rspack Bundler integration**.

For existing apps, you can enable one or both. If your app relies heavily on Meteor specifics like nested imports, use Meteor Bundler optimizations. If it follows a standard syntax without nested imports, you can also enable Rspack Bundler integration for greater benefits.

### Meteor Bundler Optimizations

:::info
Starting with Meteor 3.3
:::

Add this to your app’s `package.json`:

``` json
"meteor": {
  "modern": true
}
```

This enables all Meteor bundler optimizations, with SWC adoption as the main highlight.

> See the [**"Meteor Bundler Optimizations"** section](./modern-build-stack/meteor-bundler-optimizations.md) for migration requirements and config customization.

### Rspack Bundler Integration

:::info
Starting with Meteor 3.4
:::

Add this Atmosphere package to your app:

``` bash
meteor add rspack@1.0.0-rc340.4
```

On first run, the package installs the required Rspack setup at the project level. It compiles your app code with Rspack to get the full benefit of this integration.

> See the [**"Rspack Bundler Integration"** section](./modern-build-stack/rspack-bundler-integration.md) for migration requirements and config customization.

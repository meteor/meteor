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
meteor add rspack
```

On first run, the package installs the required Rspack setup at the project level. It compiles your app code with Rspack to get the full benefit of this integration.

> See the [**"Rspack Bundler Integration"** section](./modern-build-stack/rspack-bundler-integration.md) for migration requirements and config customization.

## Learn more

📄 [Build System guide](/about/build-tool) — In-depth guide covering Meteor's build tool, JavaScript transpilation, CSS processing, HMR, and build plugins.

📹 [Modern Build Stack in Meteor 3: Empower Your Meteor Apps with Faster, Feature-Rich Bundling](https://www.youtube.com/watch?v=LqU1eDbnG4I)

Presented by [@nachocodoner](https://github.com/nachocodoner) at [Meteor Impact](https://impact.meteorjs.community/), this video covers the motivation behind this new era of Meteor bundler optimizations and modernization with Rspack integration, what initially drove us there, what we have achieved, and how you can adopt it today. It was recorded while Meteor 3.4 was in beta, but the content is still accurate. The only difference is that you can now upgrade directly to the official Meteor 3.4 release.

📄 [Unlocking Meteor 3.2: New Profiling Tool to Track Bundler Performance and Size](https://dev.to/meteor/unlocking-meteor-32-new-profiling-tool-to-track-bundler-performance-and-size-1jc8)

Release article introducing the profiling tool that laid the groundwork for measuring and improving bundler performance.

📄 [Faster Builds in Meteor 3.3: Modern Build Stack with SWC and Bundler Optimizations](https://dev.to/meteor/faster-builds-in-meteor-33-modern-build-stack-with-swc-and-bundler-optimizations-fm2)

Release article covering the SWC transpiler adoption and the bundler optimizations shipped in Meteor 3.3.

📄 [Meteor 3.4 is out: Rspack integration, 4x faster builds, 8x smaller bundles, and extended bundler features](https://blog.galaxycloud.app/meteor-3-4-is-out-rspack-integration-4x-faster-builds-8x-smaller-bundles-and-extended-bundler-features)

Release article covering the Rspack integration and the new features in Meteor 3.4.

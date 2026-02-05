---
outline:
  level: [2, 4]
---

# Meteor Bundler Optimizations

The Meteor bundler is made up of key components that enhance your experience in development and production. We worked on each to bring all possible optimizations. As a result:

- [**Transpiler**](#transpiler-swc): Meteor is adopting **SWC** as a faster alternative to Babel.
- [**Minifier**](#minifier): Meteor uses the **SWC** minifier as a faster alternative to Terser.
- [**Web archs**](#web-arch): Meteor now skips legacy architectures in development mode.
- [**Watcher**](#watcher): Meteor now uses [`@parcel/watcher`](https://github.com/parcel-bundler/watcher) for a faster, more stable watch experience via native recursive file watching across all OS.
- [**.meteorignore**](#meteorignore): Exclude files and directories from the bundler to reduce build and watch overhead.

## Quick start

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

## Requirements

**Meteor Bundler optimizations are backward compatible**, meaning enabling modern will not introduce breaking changes to your app’s development experience.

These optimizations apply modern behavior by default and **fall back** to the previous approach if any error is encountered. For example, **SWC** compiles each file in your project, but if a syntax error appears due to an SWC incompatibility like nested imports or a missing plugin, it falls back to the **legacy Babel** transpiler configuration for Meteor and your project.

To encourage a standard structure and syntax, the next section guide you on getting the most performance from the SWC transpiler and on migrating specific plugins from legacy Babel to make your project SWC compliant.

> [**Transpiler (SWC): Optimize SWC and Handle Fallbacks**](#optimize-swc-and-handle-fallbacks)

You can also learn more about each part of the optimized components:

- [**Transpiler**](#transpiler-swc)
- [**Minifier**](#minifier)
- [**Web archs**](#web-arch)
- [**Watcher**](#watcher)
- [**.meteorignore**](#meteorignore)

---

## Transpiler (SWC)

> The transpiler converts modern JS syntax in all app code to a cross-browser compatible version.

Meteor has long used Babel, a mature and still widely adopted transpiler. However, it lags behind newer tools like SWC in terms of speed. SWC and others are not only faster but are growing in use and features, reaching parity with Babel.

Since transpilation is one of the slowest steps in development, **Meteor now gives you the option to use SWC** for your apps.

Add this to your app's `package.json`:

```json
"meteor": {
  "modern": true
}
```

When starting your app for web or native, SWC will handle all files: your app, npm packages, and Atmosphere packages. This also applies to production builds.

By default, `"modern": true` enables all build stack upgrades. To opt out of SWC transpiler, set `"transpiler": false` in your `package.json`.

```json
"meteor": {
  "modern": {
    "transpiler": false
  }
}
```

### Optimize SWC and Handle Fallbacks

To analyze and improve transpilation, you can enable verbose output. Add this to `package.json`:

```json
"meteor": {
  "modern": {
    "transpiler": {
      "verbose": true
    }
  }
}
```

This shows each file being processed, its context, cache usage, and whether it fell back to Babel due to incompatibilities.

If all your code uses SWC, you're good and can turn off verbosity. But if you [see logs like](https://forums.meteor.com/uploads/default/original/3X/e/1/e1a2c285284f82ab736bcada647d88bd4fa8d3ec.png):

``` shell
[Transpiler] Used Babel for <file>     (<context>)     Fallback
  <more-details>
```

This means SWC encountered syntax incompatibilities on the files. There are a few things you can do.

First, check the fallback details to **fix the syntax** so it’s compatible with SWC. This will maximize performance benefits and help you understand why SWC failed.

- A common cause is [**nested import statements** inside functions](#nested-imports). Move them to the top level. These work in Babel due to a Meteor-specific plugin, which SWC doesn’t support.
- Other issues may come from features tied to Babel plugins. You’ll need to find SWC equivalents. See the [SWC plugin list](https://plugins.swc.rs/versions/range/271).

> Check [**Migration Topics**](#migration-topics) to learn common scenarios for migrating your code and setting up your SWC config.

Second, **ignore the fallback** if those files run fine with Babel. SWC will still speed up other files. Meteor will keep using Babel for incompatible files on future builds.

Third, **exclude files or contexts from SWC**. Even though it falls back automatically, you can skip the overhead of trying SWC on known-incompatible files.

For example, if you're using `babel-plugin-react-compiler`, which [SWC doesn't support yet](https://react.dev/blog/2025/04/21/react-compiler-rc), you can exclude your app code adding this to `package.json`:

```json
"meteor": {
  "modern": {
    "transpiler": {
      "excludeApp": true
    }
  }
}
```

Or exclude only specific files like `.jsx`:

```json
"meteor": {
  "modern": {
    "transpiler": {
      "excludeApp": ["\\.jsx"]
    }
  }
}
```

You can also use `excludePackages`, `excludeNodeModules`, and `excludeLegacy` for finer control. See the [`modern.transpiler` config docs](#config-api) for more.

When no plugin exists, these settings let you still get most of SWC’s speed benefits by limiting fallback use.

Most apps will benefit just by enabling `modern: true`. Most Meteor packages should work right away, except ones using nested imports. Node modules will mostly work too, since they follow common standards. Most app code should also work unless it depends on Babel-specific behavior.

> Remember to turn off verbosity when you're done with optimizations.

### Externalize SWC Helpers

By default, SWC inlines transformation helpers (e.g. _extends, _objectSpread) into every file that uses them. While this ensures compatibility out of the box, it can lead to duplicated code across your bundles increasing bundle size.

To centralize these helpers and keep your client builds lean, you can add the `@swc/helpers` in your app project.

``` bash
meteor npm install --save @swc/helpers
```

> This package is installed by default for new apps.

Meteor’s build tool comes pre-configured to externalize SWC helpers for you, no extra setup or .swcrc tweaks are needed. As soon as you install @swc/helpers, Meteor’s SWC pipeline will automatically emit imports for shared helper functions rather than inlining them, ensuring your app ships each helper just once.

### Custom .swcrc

You can use `.swcrc` config in the root of your project to describe specific [SWC plugins](https://github.com/swc-project/plugins) there, that will be applied to compile the entire files of your project.

You can also configure other options using the `.swcrc` format. For custom SWC configs, see the [SWC configuration API](https://swc.rs/docs/configuration/compilation).

Use `swc.config.js` in your project root for dynamic configuration. Meteor will import and apply the SWC config automatically. This lets you choose a config based on environment variables or other runtime factors.

You can also review these migration topics that use custom `.swcrc` configs:

- [Import Aliases](#import-aliases)
- [JSX Syntax in JS files](#jsx-syntax-in-js-files)
- [React Runtime](#react-runtime)
- [Transform Imports](#transform-imports)
- [Private Properties](#private-properties)

:::warning
The standard name for the SWC configuration file is [`.swcrc`](https://swc.rs/docs/configuration/compilation).

Using as an extension, such as `config.swcrc`, won’t work.
:::

### Config API

- `modern.transpiler: [true|false]` - Default: `true`
  Enables or disables the use of the modern transpiler (SWC). If disabled, Babel will be used directly instead.

- `modern.transpiler.excludeApp: [true|false] or [string[]]`
  If true, the app’s own code (outside of Meteor core and packages) will continue using Babel.
  Otherwise, a list of file paths or regex-like patterns within the app to exclude from SWC transpilation.

- `modern.transpiler.excludeNodeModules: [true|false] or [string[]]`
  If true, the app’s node_modules will continue using Babel.
  Otherwise, a list of NPM packages names, file paths or regex-like patterns within the node_modules folder to exclude from SWC transpilation.

- `modern.transpiler.excludePackages: [true|false] or [string[]]`
  If true, the Meteor’s packages will continue using Babel.
  Otherwise, a list of package names, file paths or regex-like patterns within the package to exclude from SWC transpilation.

- `modern.transpiler.excludeLegacy: [true|false]`
  If true, the Meteor’s bundle for legacy browsers will continue using Babel.

- `modern.transpiler.verbose: [true|false]`
  If true, the transpilation process for files is shown when running the app. This helps understand which transpiler is used for each file, what fallbacks are applied, and gives a chance to either exclude files to always use Babel or migrate fully to SWC.

### Migration Topics

#### Nested Imports

Nested imports are a feature of Meteor’s bundler, not supported in standard bundlers. Meteor introduced them during a time when bundling standards were still evolving and experimented with its own approach. This feature comes from the [`reify` module](https://github.com/benjamn/reify/tree/main) and works with Babel transpilation. SWC doesn't support them since they were never standardized.

:::warning
Don't confuse nested imports with standardized dynamic imports using `import()` in module blocks, these are supported.  
:::

Example with a nested import:

``` javascript
if (condition) {
  import { a as b } from "./c";
  console.log(b);
}
```

Without a nested import (moved to top):

``` javascript
import { a as b } from "./c";

if (condition) {
  console.log(b);
}
```

For background, see: [Why nested import](https://github.com/benjamn/reify/blob/main/WHY_NEST_IMPORTS.md).

With `"modern.transpiler": true`, if SWC finds one, it silently falls back to Babel (only shows in `"verbose": true`). Nested imports isn’t standard, most modern projects use other deferred loading methods. Move imports to the top, or use require or dynamic imports. Let SWC handle the file and speeding up builds. Still, this decision is up to the devs, some Meteor devs use them for valid reasons.

#### Import Aliases

Meteor Babel lets you define aliases for import paths with [babel-plugin-module-resolver](https://www.npmjs.com/package/babel-plugin-module-resolver).

To use the same aliases in SWC, add them to your [.swcrc](#custom-swcrc):

```json
{
  "jsc": {
    "baseUrl": "./",
    "paths": {
      "@ui/*": ["ui/*"]
    }
  }
}
```

This enables you to use `@ui/components` instead of `./ui/components` in your imports.

You can use `swc.config.js` to define different aliases based on an environment variable.

``` js
var mode = process.env.MODE_ENV;

var userAliases = {
  "@ui/*": ["user/*"],
};

var adminAliases = {
  "@ui/*": ["admin/*"],
};

module.exports = {
    jsc: {
        baseUrl: "./",
        paths: mode === "USER" ? userAliases : adminAliases,
    },
};
```

:::warning
SWC only resolves aliases to imports, not `require` calls.
:::

- Imports

Binding imports inject a module to use.

``` javascript
// Binding imports
import Button from "@ui/button";
import { Button } from "@ui/button";
```

Side-effect imports run the module’s code.

``` javascript
// Side effect import
import "@ui/button";
```

- Require calls

Can import values or run the module’s code.

``` javascript
const { Button } = require("@ui/button");

require("@ui/button");
```

SWC resolve aliases for imports correctly, but require calls won’t. For require calls, use an import or a relative path.

SWC has no [module-resolver plugin like Babel’s](https://www.npmjs.com/package/babel-plugin-module-resolver) yet, which could affect require calls in the future.

#### JSX Syntax in JS files

When migrating your app to use SWC, Meteor SWC falls back to Babel if you include JSX in `.js` files, since JSX is only recognized in `.jsx` files.

To enable JSX in `.js` files, create a [`.swcrc`](#custom-swcrc) file with this config:

``` json
{
  "jsc": {
    "parser": {
      "syntax": "ecmascript",
      "jsx": true
    }
  }
}
```

> For TypeScript, set "syntax": "typescript" and "tsx": true instead.

This overrides Meteor’s internal SWC config so SWC handles `.js` and `.ts` files with React components instead of falling back to Babel.

#### React Runtime

Meteor Babel lets you skip importing React in your files by using the [`@babel/plugin-transform-react-jsx`](https://www.npmjs.com/package/@babel/plugin-transform-react-jsx) runtime config.

To use the same config in SWC, add it to your [`.swcrc`](#custom-swcrc):

```json
{
  "jsc": {
    "transform": {
      "react": {
        "runtime": "automatic"
      }
    }
  }
}
```

#### Transform Imports

You might have used Meteor Babel with the  [`babel-plugin-transform-imports`](https://www.npmjs.com/package/babel-plugin-transform-imports) plugin to rewrite imports in your app.

SWC offers a similar plugin: [`@swc/plugin-transform-imports`](https://www.npmjs.com/package/@swc/plugin-transform-imports).

To switch to SWC, install the plugin:

```bash
meteor npm install -D @swc/plugin-transform-imports
```

and add it to your [`.swcrc`](#custom-swcrc):

```json
{
  "jsc": {
    "experimental": {
      "plugins": [
        [
          "@swc/plugin-transform-imports",
          {
            "lodash": {
              "transform": "lodash/{{member}}",
              "preventFullImport": true
            }
          }
        ]
      ]
    }
  }
}
```

This tells SWC to replace, for example,

``` javascript
import { map } from "lodash"
```

with

``` javascript
import map from "lodash/map"
```

avoiding full-package imports and reducing bundle size.

You can use advanced import transformations. [See the test suite for examples.](https://github.com/swc-project/plugins/blob/main/packages/transform-imports/__tests__/wasm.test.ts#L12-L63)


#### Private Properties

SWC supports many of the most modern JS systax features, including private class properties, which Meteor Babel doesn’t.

Just by enabling SWC, Meteor will parse properly code like:

``` javascript
class ClassWithPrivate {
  #privateField;
  #privateFieldWithInitializer = 42;
  
  #privateMethod() {}
  
  static #privateStaticField;
  static #privateStaticFieldWithInitializer = 42;

  static #privateStaticMethod() {}
}
```

You can opt-out of [private properties in SWC options with "privateMethod" setting](https://swc.rs/docs/configuration/compilation#ecmascript) with the [`.swcrc`](#custom-swcrc) file.

## Minifier

> The minifier reduces and obfuscates your app’s production bundle for security and efficiency.

New apps use an **SWC-based minifier**, replacing the legacy [Terser](https://github.com/terser/terser) minifier. This speeds up production builds and deployments.

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

## Web Arch

> Web archs are the builds Meteor generates for modern browsers, legacy browsers, and Cordova.

New apps **skip `web.browser.legacy` and `web.cordova` by default in development mode** (unless developing for native). This results on getting a faster build process on development mode.

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

## Watcher

> The watcher listens for changes in your app’s code files and triggers quick recompilations.

New apps use a modern, **cross-platform watcher: [`@parcel/watcher`](https://github.com/parcel-bundler/watcher)**. It responds quickly to file changes using native file watching. Symbolic link changes and all traversed files are supported via polling.

For existing apps, enable this by adding to `package.json`:

```json
"meteor": {
  "modern": true
}
```

If you run into issues with the new watcher, you can revert to the previous implementation for better file change detection. To disable the new watcher, set `"watcher": false` in your package.json.

```json
"meteor": {
  "modern": {
    "watcher": false
  }
}
```

The modern watcher uses the OS's native file watching with a performance-first approach. Both modern and legacy watchers support environment variables for polling, useful in edge cases like WSL with host, volumes, or remote setups.

To enable polling, run your Meteor app with:

```shell
# enable polling
METEOR_WATCH_FORCE_POLLING=true meteor run

# set polling interval (in ms)
METEOR_WATCH_POLLING_INTERVAL_MS=1000 METEOR_WATCH_FORCE_POLLING=true meteor run
```

> Polling uses more CPU and RAM, but it's the most reliable option in some environments.

---

## .meteorignore

> The `.meteorignore` file tells Meteor's bundler to skip specific files and directories, reducing unnecessary work during builds.

Meteor's bundler processes every file in your project tree by default. In projects with folders that are not part of the app, such as documentation, design assets, or standalone tooling, the bundler still traverses and watches those directories. This adds overhead to both initial builds and file-change recompilations.

You can place a `.meteorignore` file in any directory of your app or package. It uses the same pattern syntax as `.gitignore` and applies rules to the directory tree below it. Meteor's file watching system is fully integrated with `.meteorignore`, so you can add, remove, or modify these files during development and the changes take effect immediately.

### Example .meteorignore

Place this file at the root of your project as `.meteorignore`:

```gitignore
# Documentation
docs/

# Design and static assets not used by the app
design/
mockups/
screenshots/

# CI/CD and infrastructure
docker/

# Testing tools outside Meteor
cypress/
playwright/

# Scripts and tooling unrelated to the app
scripts/
tools/
benchmarks/

# Misc
LICENSE
CHANGELOG.md
CONTRIBUTING.md
*.md
!README.md
```

This keeps the bundler focused on your actual app code and Meteor packages, skipping folders and files that have no role in the build. The result is faster rebuilds during development, especially in larger projects with significant non-app content.

You can also place `.meteorignore` files in subdirectories for more granular control. For example, a `.meteorignore` inside `packages/my-package/` applies only to that package's tree.

For a more dynamic approach, you can use the [`METEOR_IGNORE`](../../cli/environment-variables.md#meteor-ignore) environment variable to define ignore patterns per command without modifying project files. This is especially useful when you need different ignore rules for `meteor run` and `meteor test`.

---

## Troubleshooting

If you run into issues, try `meteor reset` or delete the `.meteor/local` folder in the project root.

For help or to report issues, post on [GitHub](https://github.com/meteor/meteor/issues) or the [Meteor forums](https://forums.meteor.com). We’re focused on making Meteor faster and your feedback helps.

You can compare performance before and after enabling `modern` by running [`meteor profile`](../../cli/index.md#meteorprofile). Share your results to show progress to others.

> **[Check out Rspack Bundler integration](rspack-bundler-integration.md) to improve performance and access newer build features.**

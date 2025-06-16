# Transpiler: SWC

:::info
Starting with Meteor 3.3
:::

> The transpiler converts modern JS syntax in all app code to a cross-browser compatible version.

Meteor has long used Babel, a mature and still widely adopted transpiler. However, it lags behind newer tools like SWC in terms of speed. SWC and others are not only faster but are growing in use and features, reaching parity with Babel.

Since transpilation is one of the slowest steps in development, Meteor now gives you the option to use SWC for your apps.

## Enable SWC

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

## Verbose transpilation process

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

## Adapt your code to benefit from SWC

If all your code uses SWC, you're good and can turn off verbosity. But if you [see logs like](https://forums.meteor.com/uploads/default/original/3X/e/1/e1a2c285284f82ab736bcada647d88bd4fa8d3ec.png):

``` shell
[Transpiler] Used Babel for <file>     (<context>)     Fallback
  <more-details>
```

This means SWC encountered syntax incompatibilities on the files. There are a few things you can do.

First, check the fallback details to **fix the syntax**. They might explain why SWC failed.

- A common cause is [**nested import statements** inside functions](#nested-imports). Move them to the top level. These work in Babel due to a Meteor-specific plugin, which SWC doesn’t support.
- Other issues may come from features tied to Babel plugins. You’ll need to find SWC equivalents. See the [SWC plugin list](https://plugins.swc.rs/versions/range/271).

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

You can also use `excludePackages`, `excludeNodeModules`, and `excludeLegacy` for finer control. See the [`modernTranspiler` config docs](#config-api) for more.

When no plugin exists, these settings let you still get most of SWC’s speed benefits by limiting fallback use.

Most apps will benefit just by enabling `modernTranspiler: true`. Most Meteor packages should work right away, except ones using nested imports. Node modules will mostly work too, since they follow common standards. Most app code should also work unless it depends on Babel-specific behavior.

> Remember to turn off verbosity when you're done with optimizations.

## Custom .swcrc

You can use `.swcrc` config in the root of your project to describe specific [SWC plugins](https://github.com/swc-project/plugins) there, that will be applied to compile the entire files of your project.

You can also configure other options using the `.swcrc` format. One common case is when your project uses `.js` files for React code. React typically uses `.jsx` for components. We still recommend following that convention for compatibility, but if you prefer `.js`, you can provide a custom `.swcrc` like this:

``` json
{
  "jsc": {
    "parser": {
      "syntax": "emcascript",
      "jsx": true
    }
  }
}
```

> You can also configure it for TypeScript, make sure to set `"syntax": "typescript"` and `"tsx": true` instead.

This overrides Meteor's internal SWC config to apply your settings, ensuring SWC processes `.js` or `.ts` files with React components without falling back to Babel.

Use `swc.config.js` in your project root for dynamic configuration. Meteor will import and apply the SWC config automatically. This lets you choose a config based on environment variables or other runtime factors.

Explore additional custom SWC configs, including ["Import Aliases"](#import-aliases) and ["React Runtime"](#react-runtime).

## Config API

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

## Migration Topics

### Nested Imports

Nested imports are a Meteor-specific feature in its bundler, unlike standard bundlers. Meteor introduced them during a time when bundling standards were still evolving and experimented with its own approach. This feature comes from the [`reify` module](https://github.com/benjamn/reify/tree/main) and works with Babel transpilation. SWC doesn't support them since they were never standardized.

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

With `"modern.transpiler": true`, if SWC finds one, it silently falls back to Babel (only shows in `"verbose": true`). Nested imports isn’t standard, most modern projects use other deferred loading methods. You might want to move imports to the top or use require instead, letting SWC handle the file and speeding up builds. Still, this decision is up to the devs, some Meteor devs use them for valid reasons.

### Import Aliases

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

### React Runtime

Meteor Babel lets you skip importing React in your files by using the [`@babel/plugin-transform-react-jsx`](https://www.npmjs.com/package/@babel/plugin-transform-react-jsx) runtime config.

To use the same config in SWC, add it to your [.swcrc](#custom-swcrc):

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

## Troubleshotting

If you run into issues, try `meteor reset` or delete the `.meteor/local` folder in the project root.

For help or to report issues, post on [GitHub](https://github.com/meteor/meteor/issues) or the [Meteor forums](https://forums.meteor.com). We’re focused on making Meteor faster and your feedback helps.

You can compare performance before and after enabling `modernTranspiler` by running [`meteor profile`](../../cli/index.md#meteorprofile). Share your results to show progress to others.

> **[Check out modern bundler options](bundler.md) to improve performance and access newer build features.**

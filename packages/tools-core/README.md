# tools-core

The tools-core package exposes helpers for managing modern tools in Meteor, providing modules for npm, log, process management, and so on; and exporting them from a Meteor package rather than being directly tied to the Meteor tool.

These helpers will be useful to integrate a modern bundler like Rspack and a native solution like CapacitorJS.

## Declaring required npm dependencies

Atmosphere packages that need the host app to install (or stay above a minimum
version of) one or more npm packages can use the shared engine in
`lib/deps.js`. The engine handles both `meteor.autoInstallDeps=true` (default)
and `meteor.autoInstallDeps=false` paths, so consumers ship only data.

```js
const { ensurePackageDependencies } = require('meteor/tools-core/lib/deps');

await ensurePackageDependencies({
  packageId: 'my-tool-core',          // stable id, used for dedup
  packageLabel: 'My Tool',            // shown in logs
  dependencies: [
    { name: 'my-tool-runtime', version: '2.0.0', dev: false },
    { name: 'my-tool-cli',     version: '2.0.0', dev: true },
  ],
  docUrl: 'https://docs.meteor.com/about/my-tool#auto-install-deps',
});
```

Do not gate the call on `hasMeteorAppConfigAutoInstallDeps()`. The engine owns
that decision, decides whether to install or warn, prints the correct log, and
dedups within the process. See `packages/rspack/lib/dependencies.js` for a
reference integration.

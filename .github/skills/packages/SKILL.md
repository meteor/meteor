---
name: packages
description: "Use when adding, removing, or finding Meteor core packages, resolving package dependencies, choosing between authentication strategies (accounts-password, passwordless, OAuth), or navigating the monorepo package ecosystem. Covers meteor add/remove commands, package lookup by feature domain, and dependency relationships across 100+ core packages."
---

# Core Packages

Overview of Meteor's package ecosystem organized by domain.

## Working with Packages

```bash
# Add a package
meteor add <package-name>

# Add multiple packages at once
meteor add accounts-password accounts-ui

# Remove a package
meteor remove <package-name>

# List installed packages
meteor list

# Show package details
meteor show <package-name>
```

## Common Scenarios

| If you need... | Use these packages |
|----------------|-------------------|
| Password login | `accounts-base` + `accounts-password` |
| Magic-link / passwordless auth | `accounts-base` + `accounts-passwordless` |
| Social login (Google, GitHub) | `accounts-base` + `accounts-oauth` + `accounts-google` / `accounts-github` |
| Two-factor authentication | `accounts-2fa` (add to any accounts setup) |
| Pre-built login UI | `accounts-ui` (or `accounts-ui-unstyled` for custom styling) |
| Real-time data sync | `mongo` + `ddp` (included by default) |
| Rate limiting on methods | `ddp-rate-limiter` |
| TypeScript support | `typescript` + `ecmascript` |
| Modern bundler (Rspack) | `rspack` (replaces default bundler) |
| Collection permissions | `allow-deny` (for simple rules) or methods (recommended) |
| HTTPS enforcement | `force-ssl` |
| Content Security Policy | `browser-policy` |

## Authentication & Accounts

| Package | Description |
|---------|-------------|
| `accounts-base` | Foundation for the user account system |
| `accounts-password` | Password-based authentication |
| `accounts-passwordless` | Magic-link/token-based authentication |
| `accounts-2fa` | Two-factor authentication support |
| `accounts-ui` / `accounts-ui-unstyled` | Pre-built UI components for auth |
| `accounts-oauth` | OAuth protocol support |
| `oauth` / `oauth1` / `oauth2` | OAuth implementation |
| `oauth-encryption` | Encrypted OAuth token storage |
| `service-configuration` | OAuth provider configuration |

**Social Login Providers:**
- `accounts-facebook`, `accounts-github`, `accounts-google`
- `accounts-twitter`, `accounts-meetup`, `accounts-weibo`
- `accounts-meteor-developer`

## Data & Database

| Package | Description |
|---------|-------------|
| `mongo` | MongoDB integration and collection API |
| `minimongo` | Client-side MongoDB emulation |
| `mongo-id` | MongoDB ObjectID generation |
| `mongo-livedata` | Reactive MongoDB queries |
| `npm-mongo` | MongoDB Node.js driver wrapper |
| `mongo-dev-server` | Development MongoDB server |
| `ddp` | Distributed Data Protocol meta-package |
| `ddp-common` | Shared DDP utilities |
| `ddp-client` | DDP client implementation |
| `ddp-server` | DDP server implementation |
| `ddp-rate-limiter` | Rate limiting for DDP methods/subscriptions |
| `ejson` | Extended JSON serialization |

## Build System & Compilation

| Package | Description |
|---------|-------------|
| `babel-compiler` | JavaScript transpilation via Babel |
| `babel-runtime` | Babel runtime helpers |
| `ecmascript` | ECMAScript 2015+ support |
| `ecmascript-runtime` | ES6+ runtime polyfills |
| `typescript` | TypeScript compilation support |
| `modules` | ES modules system |
| `modules-runtime` | Module runtime implementation |
| `modules-runtime-hot` | Hot module reloading runtime |
| `hot-code-push` | Live code updates |
| `hot-module-replacement` | HMR support |
| `rspack` | Rspack bundler integration |
| `boilerplate-generator` | HTML boilerplate generation |
| `dynamic-import` | Dynamic `import()` support |
| `caching-compiler` | Build cache management |

## Minification & Assets

| Package | Description |
|---------|-------------|
| `minifier-js` | JavaScript minification (terser) |
| `minifier-css` | CSS minification |
| `standard-minifier-js` | Default JS minifier package |
| `standard-minifier-css` | Default CSS minifier package |
| `standard-minifiers` | Meta-package for minifiers |
| `static-html` | Static HTML file processing |

## Web & Server

| Package | Description |
|---------|-------------|
| `webapp` | HTTP server and request handling |
| `webapp-hashing` | Asset fingerprinting |
| `reload` | Client-side app reload mechanism |
| `reload-safetybelt` | Reload failure recovery |
| `autoupdate` | Automatic client updates |
| `browser-policy` | Content Security Policy |
| `force-ssl` | HTTPS enforcement |
| `allow-deny` | Collection permission rules |
| `fetch` | HTTP Fetch API polyfill |
| `routepolicy` | Route-based policies |

## Client-Side Utilities

| Package | Description |
|---------|-------------|
| `tracker` | Reactive dependency tracking |
| `reactive-var` | Single reactive value |
| `reactive-dict` | Reactive key-value store |
| `session` | Client-side session storage |
| `localstorage` | LocalStorage wrapper |
| `socket-stream-client` | WebSocket client |
| `random` | Cryptographic random generation |
| `check` | Runtime type checking |
| `underscore` | Utility library |
| `base64` | Base64 encoding/decoding |
| `diff-sequence` | Array diffing algorithm |
| `id-map` | ID-based mapping |
| `ordered-dict` | Ordered dictionary |

## Testing

| Package | Description |
|---------|-------------|
| `tinytest` | Meteor's built-in test framework |
| `tinytest-harness` | Test harness utilities |
| `test-helpers` | Testing utility functions |
| `test-in-browser` | Browser-based test runner |
| `test-in-console` | Console-based test runner |

## Context & Roles

| Package | Description |
|---------|-------------|
| `context` | Request context management (AsyncLocalStorage) |
| `roles` | User roles and permissions system |

## Deprecated Packages (`packages/deprecated/`)

40+ legacy packages maintained for backward compatibility. Key migrations:

| Legacy Package | Replace With |
|---------------|-------------|
| `deps` | `tracker` |
| `facebook`, `github`, `google` | `accounts-facebook`, `accounts-github`, `accounts-google` |
| `handlebars` | Blaze templates or React |
| `*-config-ui` packages | `service-configuration` |

## Development-Only Packages

| Package | Description |
|---------|-------------|
| `autopublish` | Auto-publish all collections (remove in production) |
| `insecure` | Allow all database writes (remove in production) |

## NPM Packages (`/npm-packages`)

Packages published to npm for external use:

| Package | npm Name | Description |
|---------|----------|-------------|
| `meteor-babel` | `@meteorjs/babel` | Babel wrapper for ES2015+ transpilation |
| `babel-preset-meteor` | `@meteorjs/babel-preset-meteor` | Babel preset with Meteor-specific transforms |
| `meteor-rspack` | `@meteorjs/rspack` | Rspack configuration builder |
| `meteor-promise` | `meteor-promise` | ES6 Promise with Fiber support |
| `meteor-node-stubs` | `meteor-node-stubs` | Node.js core module polyfills for browser |
| `eslint-plugin-meteor` | `eslint-plugin-meteor` | Meteor-specific ESLint rules |

## Adding a Package to the Monorepo

1. Create directory under `packages/<package-name>/`
2. Add `package.js` with `Package.describe()` and `Package.onUse()`
3. Register exports via `api.mainModule()` or `api.export()`
4. Declare dependencies with `api.use()`
5. Verify: `meteor test-packages ./packages/<package-name>`

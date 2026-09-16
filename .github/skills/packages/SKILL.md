---
name: packages
description: Use when exploring the package ecosystem, finding which package handles a feature, understanding package relationships, or adding dependencies. Lists all core packages by domain.
---

# Core Packages

Overview of Meteor's package ecosystem organized by domain.

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

## Testing (6 packages)

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

40+ legacy packages maintained for backward compatibility:
- UI libraries: `amplify`, `backbone`, `d3`, `handlebars`
- Legacy OAuth: `facebook`, `github`, `google` (use `accounts-*` instead)
- Config UIs: `*-config-ui` packages
- Others: `jquery-history`, `jshint`, `jsparse`, `deps` (use `tracker`)

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

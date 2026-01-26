# Meteor Codebase Guide

> Quick reference for navigating and modifying the Meteor monorepo.
> For detailed documentation, see [REPOSITORY_CONTEXT.md](REPOSITORY_CONTEXT.md).

## Repository Structure

```
meteor-3/
├── packages/          # Core Meteor packages
├── tools/             # CLI tool & build system (Isobuild)
├── npm-packages/      # Published npm packages (@meteorjs/*)
├── scripts/           # Build & release automation
├── v3-docs/           # Meteor 3.x documentation
├── docs/, guide/      # Legacy (Meteor 2.x)
└── dev_bundle/        # Precompiled Node.js, npm, MongoDB
```

## Key Entry Points

| Task | Start Here |
|------|------------|
| CLI commands | `tools/cli/commands.js` |
| Build system | `tools/isobuild/bundler.js` |
| Package lookup | `packages/<name>/package.js` |
| Modern bundler | `packages/rspack/`, `packages/tools-core/` |
| Modern E2E tests | `tools/modern-tests/` |
| Authentication | `packages/accounts-base/` |
| HTTP server | `packages/webapp/` |
| Database | `packages/mongo/`, `packages/minimongo/` |
| Realtime (DDP) | `packages/ddp-server/`, `packages/ddp-client/` |

## Packages Overview

### By Domain

| Category | Key Packages |
|----------|--------------|
| **Auth** | `accounts-base`, `accounts-password`, `accounts-oauth`, `accounts-2fa` |
| **Database** | `mongo`, `minimongo`, `ddp-server`, `ddp-client`, `ejson` |
| **Build** | `babel-compiler`, `ecmascript`, `typescript`, `modules`, `rspack` |
| **Web** | `webapp`, `autoupdate`, `reload`, `browser-policy` |
| **Reactivity** | `tracker`, `reactive-var`, `reactive-dict` |
| **Utilities** | `check`, `random`, `ejson`, `fetch` |
| **Modern Tools** | `tools-core`, `rspack` |
| **Testing** | `tinytest`, `test-helpers` |

### tools-core (Modern Utilities Hub)

Central package for bundler integrations. Location: `packages/tools-core/lib/`

| Module | Purpose |
|--------|---------|
| `log.js` | Colored logging (logProgress, logError, logSuccess, logInfo) |
| `npm.js` | npm/yarn operations, dependency checking, installation |
| `process.js` | Process spawning, port checking, graceful shutdown |
| `meteor.js` | App config, entry points, command detection, package detection |
| `git.js` | Git repo detection, .gitignore management |
| `global-state.js` | Persistent state across rebuilds |

### Package Structure

```
packages/example/
├── package.js           # Manifest (dependencies, exports)
├── example.js           # Main implementation
├── example-server.js    # Server-only (optional)
├── example-client.js    # Client-only (optional)
└── example-tests.js     # Tests
```

## Tools Directory

```
tools/
├── cli/               # Command-line interface
│   ├── main.js        # Entry point (3.5K lines)
│   └── commands.js    # Command implementations
├── isobuild/          # Build system
│   ├── bundler.js     # High-level bundling (128KB)
│   ├── compiler.js    # Package compilation
│   └── linker.js      # Module linking
├── runners/           # App execution
│   ├── run-app.js     # Web app runner
│   └── run-mongo.js   # MongoDB runner
├── modern-tests/      # E2E tests for modern integrations (Jest + Playwright)
├── fs/                # File operations
├── packaging/         # Package management
└── project-context.js # Dependency resolution (72KB)
```

## Common Modifications

### Adding a Package

1. Create `packages/my-package/package.js`
2. Define dependencies with `api.use()`
3. Set entry points with `api.mainModule()`
4. Export with `api.export()`

### Adding a CLI Command

Edit `tools/cli/commands.js`:
```javascript
main.registerCommand({
  name: 'my-command',
  options: { 'flag': { type: Boolean } }
}, function(options) { /* ... */ });
```

### Using tools-core

```javascript
// In package.js: api.use('tools-core')
import { logProgress, checkNpmDependencyExists, getMeteorAppConfig } from 'meteor/tools-core';
```

### Adding Middleware

```javascript
import { WebApp } from 'meteor/webapp';
WebApp.connectHandlers.use('/api', middleware);
```

## Build Targets

| Target | Description |
|--------|-------------|
| `web.browser` | Modern browsers |
| `web.browser.legacy` | IE11 support |
| `web.cordova` | Mobile apps |
| `server` | Node.js |

## Testing

```bash
./meteor self-test                           # CLI tests
./meteor self-test "test name"               # Specific test
./meteor test-packages ./packages/my-pkg     # Package tests
```

### Modern E2E Tests (`tools/modern-tests/`)

Jest + Playwright suite for verifying modern bundler integrations (rspack). Tests cover framework skeletons and build scenarios.

```bash
npm run install:modern                       # Install dependencies
npm run test:modern                          # Run all E2E tests
npm run test:modern -- -t="React"            # Run specific test
```

**Test apps:** `apps/{react,vue,svelte,solid,blaze,typescript,babel,coffeescript,monorepo}`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `METEOR_PROFILE` | Build profiling |
| `METEOR_PACKAGE_DIRS` | Additional package paths |

## Quick Troubleshooting

- **Package not found**: Check `package.js` name, run `meteor reset`
- **npm issues**: Clear `.meteor/local/`, run `meteor npm install`
- **Build plugin not running**: Check `archMatching` and extensions

## Package Relationships

```
tools-core ──► rspack, future integrations
accounts-base ──► all accounts-* packages
ddp-server + ddp-client ──► realtime communication
mongo ──► minimongo (client-side)
webapp ──► all HTTP handling
```

## Related Documentation

- [Meteor 3.x Docs](https://docs.meteor.com) - Official documentation
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Developer setup
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [REPOSITORY_CONTEXT.md](REPOSITORY_CONTEXT.md) - Detailed codebase reference

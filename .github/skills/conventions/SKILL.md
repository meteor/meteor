---
name: conventions
description: Use when writing new packages, adding CLI commands, creating build plugins, or following Meteor code patterns. Covers package.js structure, file naming, and common code patterns.
---

# Code Conventions

Package structure, file naming, and code patterns for the Meteor codebase.

## Package Structure

Every Meteor package follows this structure:

```
packages/my-package/
├── package.js          # Package manifest (name, version, dependencies, exports)
├── my-package.js       # Main implementation (or split by concern)
├── my-package-server.js # Server-only code (optional)
├── my-package-client.js # Client-only code (optional)
├── my-package-tests.js  # Tests (loaded via api.addFiles in test mode)
└── README.md           # Documentation (optional)
```

## Package.js Anatomy

```javascript
Package.describe({
  name: 'my-package',
  version: '1.0.0',
  summary: 'Brief description',
  git: 'https://github.com/meteor/meteor.git',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom(['3.0']);  // Minimum Meteor version

  api.use([
    'ecmascript',            // ES2015+ support
    'mongo',                 // MongoDB integration
    'tracker'                // Reactivity (client)
  ]);

  api.use('accounts-base', { weak: true }); // Optional dependency

  api.mainModule('my-package-server.js', 'server');
  api.mainModule('my-package-client.js', 'client');

  api.export('MyPackage');   // Global export
});

Package.onTest(function(api) {
  api.use(['tinytest', 'my-package']);
  api.addFiles('my-package-tests.js');
});

Npm.depends({
  'lodash': '4.17.21'        // npm dependencies
});
```

## File Naming Conventions

| Pattern | Purpose |
|---------|---------|
| `*-server.js` | Server-only code |
| `*-client.js` | Client-only code |
| `*-common.js` | Shared code |
| `*-tests.js` | Test files |
| `*.d.ts` | TypeScript declarations |

## Common Patterns

### Adding a New Core Package

1. Create directory in `/packages/my-package/`
2. Add `package.js` with proper dependencies
3. Implement functionality with proper exports
4. Add tests in `*-tests.js`
5. Update version numbers if needed

### Modifying Build System

Key files to understand:
- `/tools/isobuild/bundler.js` - High-level bundling
- `/tools/isobuild/compiler.js` - Package compilation
- `/tools/project-context.js` - Dependency resolution
- `/tools/cli/commands.js` - CLI command handlers

### Adding CLI Commands

Edit `/tools/cli/commands.js` or create new command file:

```javascript
main.registerCommand({
  name: 'my-command',
  options: {
    'option-name': { type: String, short: 'o' }
  },
  catalogRefresh: new catalog.Refresh.Never()
}, function(options) {
  // Implementation
});
```

### WebApp Middleware Pattern

```javascript
import { WebApp } from 'meteor/webapp';

// Add middleware before Meteor's default handlers
WebApp.rawConnectHandlers.use('/api', (req, res, next) => {
  // Runs before authentication
  next();
});

// Add middleware after authentication
WebApp.connectHandlers.use('/api', (req, res, next) => {
  // req.userId available if authenticated
  next();
});
```

### Build Plugin Pattern

```javascript
// In package.js
Package.registerBuildPlugin({
  name: 'compile-my-files',
  use: ['ecmascript', 'caching-compiler'],
  sources: ['plugin.js'],
  npmDependencies: { 'my-compiler': '1.0.0' }
});

// In plugin.js
Plugin.registerCompiler({
  extensions: ['myext'],
  archMatching: 'web'
}, () => new MyCompiler());

class MyCompiler extends CachingCompiler {
  getCacheKey(inputFile) {
    return inputFile.getSourceHash();
  }

  compileOneFile(inputFile) {
    const source = inputFile.getContentsAsString();
    const compiled = transform(source);
    inputFile.addJavaScript({
      data: compiled,
      path: inputFile.getPathInPackage() + '.js'
    });
  }
}
```

### Using tools-core in Packages

```javascript
// In package.js
api.use('tools-core');

// In implementation
import {
  logProgress,
  checkNpmDependencyExists,
  getMeteorAppConfig,
  spawnProcess
} from 'meteor/tools-core';

// Check and install dependencies
if (!checkNpmDependencyExists('@rspack/core')) {
  installNpmDependency(['@rspack/core@^1.7.1']);
}

// Spawn external process
const proc = spawnProcess('npx', ['rspack', 'build'], {
  cwd: getMeteorAppDir(),
  onStdout: (data) => logProgress(data)
});
```

## Version Patterns

Meteor uses `X.Y.Z-rcN.M` versioning where:
- `X.Y.Z` - Semantic version
- `rcN` - Release candidate number
- `M` - Package-specific revision

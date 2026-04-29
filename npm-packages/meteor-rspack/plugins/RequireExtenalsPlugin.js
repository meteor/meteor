// RequireExternalsPlugin.js
//
// This plugin prepare the require of externals used to be lazy required by Meteor bundler.
//
// It can describe additional externals using the externals option by array, RegExp or function.
// These externals will be lazy required as well, and optionally could be resolved using
// the externalMap function if provided.
// Used for Blaze to translate require of html files to require of js files bundled by Meteor.

const fs = require('fs');
const path = require('path');

// Normalize a path to always use forward slashes (POSIX style).
// Module identifiers in bundled JS must use '/' regardless of OS.
const toPosix = (p) => p.replace(/\\/g, '/');

class RequireExternalsPlugin {
  constructor({
    filePath,
    // Externals can be:
    // - An array of strings: module name must be included in the array
    // - A RegExp: module name must match the regex
    // - A function: function(name) must return true for the module name
    externals = null,
    // ExternalMap is a function that receives the request object and returns the external request path
    // It can be used to customize how external modules are mapped to file paths
    // If not provided, the default behavior is to map the external module name.
    externalMap = null,
    // Enable global polyfill for module and exports
    // If true, globalThis.module and globalThis.exports will be defined if they don't exist
    enableGlobalPolyfill = true,
    // Check function to determine if an external import should be eager
    // If provided, it will be called with the package name and should return true for eager imports
    // If not provided or returns false, the import will be lazy (default behavior)
    isEagerImport = null,
    // Array of module paths that should always be imported at the end of the file
    // These will be treated as eager imports but will always be placed after all other imports
    lastImports = null,
  } = {}) {
    this.pluginName = 'RequireExternalsPlugin';

    // Prepare externals
    this._externals = externals;
    this._externalMap = externalMap;
    this._enableGlobalPolyfill = enableGlobalPolyfill;
    this._isEagerImport = isEagerImport;
    this._lastImports = lastImports;
    this._defaultExternalPrefix = 'external ';

    // Prepare paths
    this.filePath = path.resolve(process.cwd(), filePath);
    this.backRoot = '../'.repeat(
      filePath.replace(/^\.?[/\\]+/, '').split(/[/\\]/).length - 1
    );

    // Initialize funcCount based on existing helpers in the file
    this._funcCount = this._computeNextFuncCount();
  }

  // Helper method to check if a module name matches the externals or default prefix
  _isExternalModule(name) {
    if (typeof name !== 'string') return false;

    // Check externals if provided
    if (this._externals) {
      // If externals is an array, use includes method
      if (Array.isArray(this._externals)) {
        if (this._externals.includes(name)) {
          return { isExternal: true, type: 'externals', value: name };
        }
      }
      // If externals is a RegExp, use test method
      else if (this._externals instanceof RegExp) {
        if (this._externals.test(name)) {
          return { isExternal: true, type: 'externals', value: name };
        }
      }
      // If externals is a function, call it with the name
      else if (typeof this._externals === 'function') {
        if (this._externals(name)) {
          return { isExternal: true, type: 'externals', value: name };
        }
      }
    }

    if (name.startsWith(this._defaultExternalPrefix)) {
      return { isExternal: true, type: 'prefix', value: name };
    }

    return { isExternal: false };
  }

  // Helper method to extract package name from module name
  _extractPackageName(name) {
    let pkg = name.slice(this._defaultExternalPrefix.length);
    if (pkg.startsWith('"') && pkg.endsWith('"')) pkg = pkg.slice(1, -1);
    const depInfo = path.parse(name);
    // If the extracted package name is a path, use the path as is
    if (
      pkg &&
      (path.isAbsolute(pkg) ||
        pkg.startsWith('./') ||
        pkg.startsWith('.\\') ||
        pkg.startsWith('../') ||
        pkg.startsWith('..\\') ||
        !!depInfo.ext)
    ) {
      const module = this.externalsMeta.get(pkg);
      if (module) {
        return `${this.backRoot}${toPosix(module.relativeRequest)}`;
      }
      return `${this.backRoot}${toPosix(name)}`;
    }

    return pkg;
  }

  apply(compiler) {
    // Initialize externalsMeta if it doesn't exist
    this.externalsMeta = this.externalsMeta || new Map();

    // Only set compiler.options.externals if both externals and externalMap are defined
    if (this._externals && this._externalMap) {
      compiler.options.externals = [
        ...compiler.options.externals || [],
        (module, callback) => {
          const { request, context } = module;
          const matchInfo = this._isExternalModule(request);
          if (matchInfo.isExternal) {

            let externalRequest;
            // Use externalMap function if provided
            if (this._externalMap && typeof this._externalMap === 'function') {
              externalRequest = this._externalMap(module);

              const relContext = path.relative(process.cwd(), context);
              // Store the original request to resolve properly the lazy html require later
              this.externalsMeta.set(externalRequest, {
                originalRequest: request,
                externalRequest,
                relativeRequest: toPosix(path.join(relContext, request)),
              });

              // tell Rspack "don't bundle this, import it at runtime"
              return callback(null, externalRequest);
            }
          }

          callback(); // otherwise normal resolution
        }
      ];
    }

    compiler.hooks.done.tap({ name: this.pluginName, stage: -10 }, (stats) => {
      // 1) Ensure globalThis.module / exports block is present if enabled
      if (this._enableGlobalPolyfill) {
        this._ensureGlobalThisModule();
      }

      // 2) Re-load existing requires from disk on every run
      const existing = this._readExistingRequires();

      // 2a) Compute the *current* externals in this build
      const info = stats.toJson({ modules: true });
      const current = new Set();
      for (const m of info.modules) {
        const matchInfo = this._isExternalModule(m.name);
        if (matchInfo.isExternal) {
          const pkg = this._extractPackageName(m.name, matchInfo);
          if (pkg) {
            current.add(pkg);
          }
        }
      }

      // 2b) Remove any requires that are no longer in `current`
      const toRemove = [...existing].filter(p => !current.has(p));
      if (toRemove.length) {
        let content = fs.readFileSync(this.filePath, 'utf-8');

        // Strip stale require(...) lines
        for (const pkg of toRemove) {
          const re = new RegExp(`^.*require\\('${pkg}'\\);?.*(\\r?\\n)?`, 'gm');
          content = content.replace(re, '');
        }

        // Strip out any now-empty helper functions:
        //   function lazyExternalImportsX() {
        //   }
        // or new format:
        //   // (function eagerExternalImportsX() {
        //   // })
        // or lastImports format:
        //   // (function lastImports() {
        //   // })
        const emptyLazyFnRe = /^function\s+lazyExternalImports\d+\s*\(\)\s*{\s*}\s*(\r?\n)?/gm;
        const emptyEagerFnRe = /^\/\/\s*\(function\s+eagerExternalImports\d+\s*\(\)\s*{\s*\n\/\/\s*\}\)\s*(\r?\n)?/gm;
        const emptyLastFnRe = /^\/\/\s*\(function\s+lastImports(?:\d+)?\s*\(\)\s*{\s*\n\/\/\s*\}\)\s*(\r?\n)?/gm;
        content = content.replace(emptyLazyFnRe, '');
        content = content.replace(emptyEagerFnRe, '');
        content = content.replace(emptyLastFnRe, '');

        // Write the cleaned file back
        fs.writeFileSync(this.filePath, content, 'utf-8');

        // Re-populate `existing` so the add-diff is accurate
        existing.clear();
        // Check for require statements
        for (const match of content.matchAll(/require\('([^']+)'\)/g)) {
          existing.add(match[1]);
        }
        // Also check for import statements (used in the new format)
        for (const match of content.matchAll(/import\s+'([^']+)'/g)) {
          existing.add(match[1]);
        }
      }

      // 3) Collect any new externals from this build and separate into eager, lazy, and last
      const newLazyRequires = [];
      const newEagerRequires = [];
      const newLastRequires = [];

      for (const module of info.modules) {
        const name = module.name;
        const matchInfo = this._isExternalModule(name);
        if (!matchInfo.isExternal) continue;

        const pkg = this._extractPackageName(name, matchInfo);
        if (pkg && !existing.has(pkg)) {
          existing.add(pkg);

          // Check if this should be a last import
          if (this._lastImports && Array.isArray(this._lastImports) && this._lastImports.includes(pkg)) {
            newLastRequires.push(`require('${pkg}')`);
          }
          // Check if this should be an eager import
          else if (this._isEagerImport && typeof this._isEagerImport === 'function' && this._isEagerImport(pkg)) {
            newEagerRequires.push(`require('${pkg}')`);
          } else {
            // Default to lazy import
            newLazyRequires.push(`require('${pkg}')`);
          }
        }
      }

      // 4) Append new lazy imports if any
      if (newLazyRequires.length) {
        const fnName = `lazyExternalImports${this._funcCount++}`;
        const body = newLazyRequires.map(req => `  ${req};`).join('\n');
        const fnCode = `\nfunction ${fnName}() {\n${body}\n}\n`;
        try {
          fs.appendFileSync(this.filePath, fnCode);
        } catch (err) {
          console.error(`Failed to append lazy imports to ${this.filePath}:`, err);
        }
      }

      // 5) Append new eager imports if any
      if (newEagerRequires.length) {
        const fnName = `eagerExternalImports${this._funcCount++}`;
        // Convert require statements to import statements
        const body = newEagerRequires
          .map(req => {
            // Extract the module path from require('path')
            const modulePath = req.match(/require\('([^']+)'\)/)[1];
            return `import '${modulePath}';`;
          })
          .join('\n');
        // Use comments instead of actual function
        const fnCode = `\n// (function ${fnName}() {\n${body}\n// })\n`;
        try {
          fs.appendFileSync(this.filePath, fnCode);
        } catch (err) {
          console.error(`Failed to append eager imports to ${this.filePath}:`, err);
        }
      }

      // 6) Handle lastImports - these should always be at the end of the file
      // First, check if lastImports already exist in the file
      let lastImportsExist = false;
      let lastImportsAtEnd = false;
      let content = '';

      if (fs.existsSync(this.filePath)) {
        content = fs.readFileSync(this.filePath, 'utf-8');

        // Check if lastImports exist in the file
        const lastImportsRe = /\/\/\s*\(function\s+lastImports(?:\d+)?\s*\(\)\s*{\s*\n([\s\S]*?)\/\/\s*\}\)/g;
        const match = lastImportsRe.exec(content);

        if (match) {
          lastImportsExist = true;

          // Check if lastImports are at the end of the file
          // We'll consider them at the end if there's only whitespace after them
          const afterLastImports = content.substring(match.index + match[0].length);
          if (/^\s*$/.test(afterLastImports)) {
            lastImportsAtEnd = true;
          }
        }
      }

      // If lastImports exist but are not at the end, move them to the end
      if (lastImportsExist && !lastImportsAtEnd) {
        // Remove the existing lastImports
        const lastImportsRe = /\/\/\s*\(function\s+lastImports(?:\d+)?\s*\(\)\s*{\s*\n[\s\S]*?\/\/\s*\}\)\s*(\r?\n)?/g;
        content = content.replace(lastImportsRe, '');

        // Extract the imports from the existing lastImports
        const importRe = /import\s+'([^']+)'/g;
        const existingLastImports = [];
        let match;

        while ((match = importRe.exec(content)) !== null) {
          if (this._lastImports && Array.isArray(this._lastImports) && this._lastImports.includes(match[1])) {
            existingLastImports.push(`import '${match[1]}';`);
          }
        }

        // Add any new lastImports
        if (this._lastImports && Array.isArray(this._lastImports)) {
          for (const pkg of this._lastImports) {
            if (!existingLastImports.some(imp => imp === `import '${pkg}';`) && existing.has(pkg)) {
              existingLastImports.push(`import '${pkg}';`);
            }
          }
        }

        // Add the lastImports to the end of the file
        if (existingLastImports.length > 0) {
          const body = existingLastImports.join('\n');
          const fnCode = `\n// (function lastImports() {\n${body}\n// })\n`;
          fs.writeFileSync(this.filePath, content + fnCode);
        } else {
          fs.writeFileSync(this.filePath, content);
        }
      }
      // If lastImports don't exist, add them if needed
      else if (!lastImportsExist) {
        // Collect all lastImports
        const allLastImports = [];

        // Add any new lastImports from this build
        if (newLastRequires.length) {
          for (const req of newLastRequires) {
            const modulePath = req.match(/require\('([^']+)'\)/)[1];
            allLastImports.push(`import '${modulePath}';`);
          }
        }

        // Add any existing lastImports from the configuration
        if (this._lastImports && Array.isArray(this._lastImports)) {
          for (const pkg of this._lastImports) {
            if (!allLastImports.some(imp => imp === `import '${pkg}';`) && !existing.has(pkg)) {
              allLastImports.push(`import '${pkg}';`);
            }
          }
        }

        // Add the lastImports to the end of the file
        if (allLastImports.length > 0) {
          const body = allLastImports.join('\n');
          const fnCode = `\n// (function lastImports() {\n${body}\n// })\n`;
          try {
            fs.appendFileSync(this.filePath, fnCode);
          } catch (err) {
            console.error(`Failed to append last imports to ${this.filePath}:`, err);
          }
        }
      }
      // If lastImports exist and are already at the end, add any new ones
      else if (lastImportsExist && lastImportsAtEnd && newLastRequires.length) {
        // Extract the existing lastImports
        const lastImportsRe = /\/\/\s*\(function\s+lastImports(?:\d+)?\s*\(\)\s*{\s*\n([\s\S]*?)\/\/\s*\}\)/;
        const match = lastImportsRe.exec(content);

        if (match) {
          const existingBody = match[1];
          const existingImports = new Set();

          // Extract the imports from the existing lastImports
          const importRe = /import\s+'([^']+)'/g;
          let importMatch;

          while ((importMatch = importRe.exec(existingBody)) !== null) {
            existingImports.add(importMatch[1]);
          }

          // Add any new lastImports
          let newBody = existingBody;
          for (const req of newLastRequires) {
            const modulePath = req.match(/require\('([^']+)'\)/)[1];
            if (!existingImports.has(modulePath)) {
              newBody += `import '${modulePath}';\n`;
            }
          }

          // Replace the existing lastImports with the updated ones
          const updatedContent = content.replace(
            lastImportsRe,
            `// (function lastImports() {\n${newBody}// })`
          );

          fs.writeFileSync(this.filePath, updatedContent);
        }
      }
    });
  }

  _computeNextFuncCount() {
    let max = 0;
    if (fs.existsSync(this.filePath)) {
      try {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        // Check for lazy, eager, and last external imports functions
        const lazyFnRe = /function\s+lazyExternalImports(\d+)\s*\(\)/g;
        // Only match the new commented format
        const eagerFnRe = /\/\/\s*\(function\s+eagerExternalImports(\d+)\s*\(\)/g;
        // Match the lastImports format
        const lastFnRe = /\/\/\s*\(function\s+lastImports(\d+)?\s*\(\)/g;

        let match;
        // Check lazy imports
        while ((match = lazyFnRe.exec(content)) !== null) {
          const n = parseInt(match[1], 10);
          if (n > max) max = n;
        }

        // Check eager imports
        while ((match = eagerFnRe.exec(content)) !== null) {
          const n = parseInt(match[1], 10);
          if (n > max) max = n;
        }

        // Check last imports
        while ((match = lastFnRe.exec(content)) !== null) {
          if (match[1]) {
            const n = parseInt(match[1], 10);
            if (n > max) max = n;
          }
        }
      } catch {
        // ignore read errors
      }
    }
    // next count is max found plus one
    return max + 1;
  }

  _ensureGlobalThisModule() {
    const block = [
      `/* Polyfill globalThis.module, exports & module for legacy */`,
      `if (typeof globalThis !== 'undefined') {`,
      `  if (typeof globalThis.module === 'undefined') {`,
      `    globalThis.module = { exports: {} };`,
      `  }`,
      `  if (typeof globalThis.exports === 'undefined') {`,
      `    globalThis.exports = globalThis.module.exports;`,
      `  }`,
      `}`,
      `if (typeof window.module === 'undefined') {`,
      `  window.module = { exports: {} };`,
      `}`,
    ].join('\n') + '\n';

    let content = '';
    if (fs.existsSync(this.filePath)) {
      content = fs.readFileSync(this.filePath, 'utf-8');
      if (!content.includes(`typeof globalThis.module === 'undefined'`)) {
        // Prepend so it lives at the very top
        fs.writeFileSync(this.filePath, content + '\n' + block, 'utf-8');
      }
    } else {
      // File doesn’t exist yet: create with just the block
      fs.writeFileSync(this.filePath, block, 'utf-8');
    }
  }

  _readExistingRequires() {
    const existing = new Set();
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      // Check for require statements
      const requireRegex = /require\('([^']+)'\)/g;
      let match;
      while ((match = requireRegex.exec(content)) !== null) {
        existing.add(match[1]);
      }

      // Also check for import statements (used in the new format)
      const importRegex = /import\s+'([^']+)'/g;
      while ((match = importRegex.exec(content)) !== null) {
        existing.add(match[1]);
      }
    } catch {
      // ignore if file missing or unreadable
    }
    return existing;
  }
}

module.exports = { RequireExternalsPlugin };

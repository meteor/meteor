const path = require('node:path');
const { createRequire } = require('node:module');

function loadOptionalDependency(moduleName, projectDir) {
  // App-owned plugins must resolve from the app even when meteor-rspack is
  // symlinked outside its node_modules. Keep package-local installs as a fallback.
  const requireFromProject = createRequire(path.join(projectDir, 'package.json'));
  for (const requireFrom of [requireFromProject, require]) {
    let resolved;
    try {
      resolved = requireFrom.resolve(moduleName);
    } catch (error) {
      // A missing main/exports target also uses MODULE_NOT_FOUND, but names
      // the broken entry path. Only an absent requested module is optional.
      if (
        error.code === 'MODULE_NOT_FOUND' &&
        error.message.startsWith(`Cannot find module '${moduleName}'`)
      ) {
        continue;
      }
      throw error;
    }

    // Load outside the catch so errors inside installed plugins propagate.
    return requireFrom(resolved);
  }
  return null;
}

module.exports = { loadOptionalDependency };

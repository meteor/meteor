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
      if (error.code === 'MODULE_NOT_FOUND') continue;
      throw error;
    }

    // Only resolution is optional. A broken installed plugin (including a
    // missing transitive dependency) must fail instead of silently disabling it.
    return requireFrom(resolved);
  }
  return null;
}

module.exports = { loadOptionalDependency };

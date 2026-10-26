const path = require('path');
const fs = require('fs');

function isOutside(relative) {
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

// output.path can be an app's public/ or private/ source directory. Only the
// configured generated contexts belong to this compiler's cleanup.
function keepOutsideContexts(outputPath, contexts) {
  const outputRoot = path.resolve(outputPath);
  const owned = contexts
    .filter(context => typeof context === 'string' && context.length > 0)
    .map(context => path.relative(outputRoot, path.resolve(outputRoot, context)))
    .filter(context => context && !isOutside(context));

  return filename => {
    if (typeof filename !== 'string' || filename.includes('\0')) return true;
    const relative = path.relative(outputRoot, path.resolve(outputRoot, filename));
    if (isOutside(relative)) return true;

    const canClean = owned.some(context =>
      relative === context || relative.startsWith(`${context}${path.sep}`) ||
      // Rspack calls keep on directories before walking their children. Let
      // it traverse the output root and parents of nested owned contexts.
      relative === '' || context.startsWith(`${relative}${path.sep}`)
    );
    if (!canClean) return true;

    // Rspack follows directory symlinks while cleaning. Check every component,
    // including the output root, even when it calls keep directly on a file.
    let current = outputRoot;
    const segments = relative ? relative.split(path.sep) : [];
    try {
      for (const segment of ['', ...segments]) {
        current = path.join(current, segment);
        if (fs.lstatSync(current).isSymbolicLink()) return true;
      }
    } catch {
      // If ownership cannot be checked, preserve the path.
      return true;
    }
    return false;
  };
}

module.exports = { keepOutsideContexts };

/**
 * Build gitignore-style "unignore" patterns for specific files/folders.
 *
 * Rules:
 *  - Files:  !a/  !a/b/  !a/b/c.txt
 *  - Folders (must end with '/'):
 *            !a/  !a/b/  !a/b/c/  !a/b/c/**
 *
 * @param {string[]} inputPaths  Paths to keep. Use '/' for dirs (e.g. 'assets/public/').
 * @param {Object} [options]
 * @param {boolean} [options.includeAllAncestors=true]  If false, only include the immediate parent dir.
 * @param {boolean} [options.includeGlobForDirs=true]   Emit '**' for directories.
 * @param {number} [options.skipLevel=0]               Skip this many levels from the beginning.
 * @returns {string[]} Negation patterns, in correct order.
 */
export function buildUnignorePatterns(inputPaths, {
  includeAllAncestors = true,
  includeGlobForDirs = true,
  skipLevel = 0,
} = {}) {
  const out = [];
  const seen = new Set();

  const push = (p) => {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };

  for (let raw of inputPaths) {
    if (!raw || typeof raw !== 'string') continue;

    // Normalize: forward slashes, drop leading './', collapse double slashes
    let anchored = raw.startsWith('/');
    let p = raw.replace(/\\/g, '/')
      .replace(/^\.\/+/, '')
      .replace(/\/{2,}/g, '/');

    // detect dir by trailing slash
    const isDir = p.endsWith('/');
    // strip leading + trailing slashes for splitting, but remember anchoring
    const core = p.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!core) continue;

    const parts = core.split('/');

    // Process based on skipLevel
    if (skipLevel >= parts.length) {
      // Skip everything if skipLevel is greater than or equal to the number of parts
      continue;
    }

    // Ancestors (top-down)
    if (includeAllAncestors) {
      // Start from skipLevel + 1 to skip the specified number of levels
      const startLevel = Math.max(1, skipLevel + 1);
      for (let i = startLevel; i <= parts.length - 1; i++) {
        const anc = (anchored ? '/' : '') + parts.slice(0, i).join('/') + '/';
        push('!' + anc);
      }
    } else if (parts.length > 1) {
      // Only immediate parent
      // For minimal mode with skipLevel, we need to check if the parent is at a level we should skip
      if (skipLevel < parts.length - 1) {
        // Check if the parent's level is greater than skipLevel
        const parentLevel = parts.length - 1;
        if (parentLevel > skipLevel) {
          const parent = (anchored ? '/' : '') + parts.slice(0, parts.length - 1).join('/') + '/';
          push('!' + parent);
        }
      }
    }

    // Add the file/directory pattern
    if (isDir) {
      const dir = (anchored ? '/' : '') + parts.join('/') + '/';
      push('!' + dir);
      if (includeGlobForDirs) push('!' + dir + '**');
    } else {
      const file = (anchored ? '/' : '') + parts.join('/');
      push('!' + file);
    }
  }

  return out;
}

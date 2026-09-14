var fs = require('fs');
var path = require('path');

/**
 * Splits a whitespace-delimited list of ignore patterns, as accepted by the
 * METEOR_IGNORE environment variable.
 *
 * @param {string} value - Raw environment variable value
 * @returns {string[]} - Array of ignore patterns
 */
function parseIgnoreEnv(value) {
  return (value || '').trim().split(/\s+/).filter(Boolean);
}

/**
 * Reads the ignore patterns that apply to the given project directory: the
 * entries of its .meteorignore file followed by the ones in the METEOR_IGNORE
 * environment variable. Empty lines and comment lines (starting with #) are
 * filtered out.
 *
 * The two sources are combined the way meteor-tool combines them (see
 * optimisticReadMeteorIgnore in tools/fs/optimistic.ts), with METEOR_IGNORE
 * last so that it can override the file under gitignore's last-match-wins
 * rule.
 *
 * @param {string} projectDir - The project directory path
 * @returns {string[]} - Array of ignore patterns
 */
const getMeteorIgnoreEntries = function (projectDir) {
  const meteorIgnorePath = path.join(projectDir, '.meteorignore');

  let fileEntries = [];

  // Check if .meteorignore file exists
  try {
    const fileContent = fs.readFileSync(meteorIgnorePath, 'utf8');

    // Process each line in the file
    fileEntries = fileContent.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'));
  } catch (e) {
    // If the file doesn't exist or can't be read, fall back to the
    // environment variable alone.
  }

  return [...fileEntries, ...parseIgnoreEnv(process.env.METEOR_IGNORE)];
};

/**
 * Creates a glob config array for ignoring specified patterns.
 * Transforms .gitignore-style entries into chokidar-compatible glob patterns.
 * @param {string[]} entries - Array of .gitignore-style patterns
 * @returns {string[]} - Array of glob patterns for chokidar
 */
function createIgnoreGlobConfig(entries = []) {
  if (!Array.isArray(entries)) {
    throw new Error('Entries must be an array');
  }

  const globPatterns = [];

  entries.forEach(entry => {
    // Skip empty entries
    if (!entry.trim()) {
      return;
    }

    // Handle comments
    if (entry.startsWith('#')) {
      return;
    }

    // Check if it's a negation pattern
    const isNegation = entry.startsWith('!');
    let pattern = isNegation ? entry.substring(1).trim() : entry.trim();

    // Remove leading ./ or / if present
    pattern = pattern.replace(/^(\.\/|\/)/g, '');

    // If it ends with /, it's a directory pattern, add ** to match all contents
    if (pattern.endsWith('/')) {
      pattern = pattern.slice(0, -1) + '/**';
    }

    // If it doesn't include a /, it could match anywhere in the path
    if (!pattern.includes('/')) {
      pattern = '**/' + pattern;
    } else if (!pattern.startsWith('**/') && !pattern.startsWith('/')) {
      // If it has a / but doesn't start with **/, add **/ to match anywhere
      pattern = '**/' + pattern;
    }

    // Add the negation back if it was present
    if (isNegation) {
      pattern = '!' + pattern;
    }

    globPatterns.push(pattern);
  });

  return globPatterns;
}

/**
 * Creates a regex pattern to match the specified glob patterns.
 * Converts glob patterns with * and ** into regex equivalents.
 *
 * Negation patterns cannot be expressed in a single regex and are dropped, so
 * this only suits pattern lists known to be positive-only — Rspack's `exclude`
 * option, which accepts nothing but a RegExp. Patterns that come from the app
 * author go through createIgnoreMatcherSource instead.
 *
 * @param {string[]} globPatterns - Array of glob patterns from createIgnoreGlobConfig
 * @param {string} [rootPath] - Absolute root that matched paths must belong to
 * @returns {RegExp} - Regex pattern to match the specified patterns
 */
function createIgnoreRegex(globPatterns, rootPath) {
  if (!Array.isArray(globPatterns) || globPatterns.length === 0) {
    throw new Error('globPatterns must be a non-empty array');
  }

  // Rspack applies context exclusions to absolute module paths. Anchor rooted
  // patterns here so matching starts inside the app, not in a parent folder.
  const pathPrefix = rootPath
    ? `^${rootPath
        .replace(/\\/g, '/')
        .replace(/\/+$/, '')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|$)`
    : '(?:^|/)';

  // Process each glob pattern and convert to regex
  const regexPatterns = globPatterns.map(pattern => {
    // Skip negation patterns for the regex
    if (pattern.startsWith('!')) {
      return null;
    }

    // Escape special regex characters, but not * and /
    let regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

    // Use a temporary placeholder for ** that won't be affected by the * replacement
    // This is necessary because if we directly replace ** with .* and then replace * with [^/]*
    const DOUBLE_ASTERISK_PLACEHOLDER = '__DOUBLE_ASTERISK__';
    regexPattern = regexPattern.replace(/\*\*/g, DOUBLE_ASTERISK_PLACEHOLDER);

    // Convert * to regex equivalent (any number of characters except /)
    regexPattern = regexPattern.replace(/\*/g, '[^/]*');

    // Convert the ** placeholder to its regex equivalent (any number of characters including /)
    regexPattern = regexPattern.replace(new RegExp(DOUBLE_ASTERISK_PLACEHOLDER, 'g'), '.*');

    regexPattern = pathPrefix + regexPattern;

    return regexPattern;
  }).filter(pattern => pattern !== null);

  if (regexPatterns.length === 0) {
    // If all patterns were negations, return a regex that matches nothing
    return new RegExp('^$');
  }

  // Join all patterns with | to create a single regex
  const combinedPattern = regexPatterns.join('|');
  return new RegExp(combinedPattern);
}

/**
 * Builds the pieces a generated eager-test module needs to decide which test
 * files .meteorignore keeps.
 *
 * .meteorignore uses gitignore syntax, where the last matching pattern wins and
 * a `!pattern` re-includes a path an earlier pattern excluded. Reimplementing
 * that on top of a RegExp lost every negation, which silently reduced a sharded
 * test run to zero test files, so the generated module is handed the same
 * `ignore` package meteor-tool applies to .meteorignore (see
 * tools/fs/optimistic.ts). Both bundlers then agree on the semantics.
 *
 * Returned as source rather than as a predicate because it runs inside the
 * bundle, not in this process: the paths it tests come from
 * import.meta.webpackContext.
 *
 * @param {string[]} entries - .meteorignore-style patterns, in order
 * @returns {{ modulePath: string, source: string }|null} - The `ignore` module
 *   to import, and a `(createIgnore) => (contextKey) => boolean` factory
 *   expression. Null when there is nothing to filter.
 */
function createIgnoreMatcherSource(entries = []) {
  if (!Array.isArray(entries)) {
    throw new Error('Entries must be an array');
  }

  if (entries.length === 0) {
    return null;
  }

  return {
    // Resolved here rather than at module load so that requiring this file
    // stays cheap and does not depend on `ignore` being installed.
    modulePath: require.resolve('ignore'),
    source: `(createIgnore => {
  const ig = createIgnore().add(${JSON.stringify(entries)});
  // import.meta.webpackContext keys look like './imports/a.tests.ts', but
  // \`ignore\` wants a path relative to the project root and rejects the './'.
  return key => ig.ignores(key.replace(/^\\.\\//, ''));
})`,
  };
}

module.exports = {
  createIgnoreGlobConfig,
  createIgnoreMatcherSource,
  createIgnoreRegex,
  getMeteorIgnoreEntries,
};

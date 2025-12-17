var fs = require('fs');
var path = require('path');

/**
 * Reads the .meteorignore file from the given project directory and returns
 * the parsed entries. Empty lines and comment lines (starting with #) are filtered out.
 *
 * @param {string} projectDir - The project directory path
 * @returns {string[]} - Array of ignore patterns
 */
const getMeteorIgnoreEntries = function (projectDir) {
  const meteorIgnorePath = path.join(projectDir, '.meteorignore');

  // Check if .meteorignore file exists
  try {
    const fileContent = fs.readFileSync(meteorIgnorePath, 'utf8');

    // Process each line in the file
    const entries = fileContent.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'));

    return entries;
  } catch (e) {
    // If the file doesn't exist or can't be read, return empty array
    return [];
  }
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
 * @param {string[]} globPatterns - Array of glob patterns from createIgnoreGlobConfig
 * @returns {RegExp} - Regex pattern to match the specified patterns
 */
function createIgnoreRegex(globPatterns) {
  if (!Array.isArray(globPatterns) || globPatterns.length === 0) {
    throw new Error('globPatterns must be a non-empty array');
  }

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

    // For absolute paths, we don't want to force the pattern to match from the beginning
    // but we still want to ensure it matches to the end of the path segment
    regexPattern = '(?:^|/)' + regexPattern + '$';

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

module.exports = {
  createIgnoreRegex,
  getMeteorIgnoreEntries,
  createIgnoreGlobConfig,
};

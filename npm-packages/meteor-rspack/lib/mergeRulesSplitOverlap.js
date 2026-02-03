/**
 * Utilities for merging webpack/rspack configurations with special handling for
 * overlapping file extensions in module rules.
 */

const { mergeWithCustomize } = require('webpack-merge');
const isEqual = require('fast-deep-equal');

/**
 * File extensions to check when determining rule overlaps.
 */
const EXT_CATALOG = [
  '.tsx', '.ts', '.mts', '.cts',
  '.jsx', '.js', '.mjs', '.cjs',
];

/**
 * Converts rule.test to predicate functions.
 * @param {Object} rule - Rule object
 * @returns {Function[]} Predicate functions
 */
function testsFrom(rule) {
  const t = rule.test;
  if (!t) return [() => true]; // no test means match all; you can tighten if you want
  const arr = Array.isArray(t) ? t : [t];
  return arr.map(el => {
    if (el instanceof RegExp) return (s) => el.test(s);
    if (typeof el === 'function') return el;
    if (typeof el === 'string') {
      // Webpack allows string match; treat as substring
      return (s) => s.includes(el);
    }
    return () => false;
  });
}

/**
 * Checks if rule matches a file extension.
 * @param {Object} rule - Rule object
 * @param {string} ext - File extension
 * @returns {boolean} True if matches
 */
function ruleMatchesExt(rule, ext) {
  // simulate a filename to test against
  const filename = `x${ext}`;
  const preds = testsFrom(rule);
  return preds.some(fn => {
    try { return !!fn(filename); } catch { return false; }
  });
}

/**
 * Creates regex for matching file extensions.
 * @param {string[]} exts - File extensions
 * @returns {RegExp} Regex like /\.(js|jsx)$/
 */
function regexFromExts(exts) {
  const body = exts.map(e => e.replace(/^\./, '')).join('|');
  return new RegExp(`\\.(${body})$`, 'i');
}

/**
 * Clones rule with new test property.
 * @param {Object} rule - Rule to clone
 * @param {RegExp|Function|string} newTest - New test value
 * @returns {Object} Cloned rule
 */
function cloneWithTest(rule, newTest) {
  return { ...rule, test: newTest };
}

/**
 * Merges rules with special handling for overlapping extensions.
 * - Replaces overlapping parts with B rules
 * - Preserves non-overlapping parts from A rules
 * 
 * @param {Array} aRules - Base rules
 * @param {Array} bRules - Rules to merge in
 * @returns {Array} Merged rules
 */
function splitOverlapRulesMerge(aRules, bRules) {
  const result = [...aRules];

  for (const bRule of bRules) {
    // Try to find an A rule that overlaps B by extensions
    let replaced = false;

    for (let i = 0; i < result.length; i++) {
      const aRule = result[i];


      const isMergeableRule = isEqual(aRule?.include || [], bRule?.include || []);
      if (!isMergeableRule) continue;

      // Determine which extensions each rule matches (within our catalog)
      const aExts = EXT_CATALOG.filter(ext => ruleMatchesExt(aRule, ext));
      const bExts = EXT_CATALOG.filter(ext => ruleMatchesExt(bRule, ext));

      if (aExts.length === 0 || bExts.length === 0) {
        continue; // nothing meaningful to compare in our catalog
      }

      const overlap = aExts.filter(e => bExts.includes(e));
      if (overlap.length === 0) continue;

      // 1) Replace the overlapping A rule with B
      result[i] = bRule;

      // 2) Add a "residual" A rule for the non-overlapping extensions
      const residual = aExts.filter(e => !overlap.includes(e));
      if (residual.length > 0) {
        const residualRule = cloneWithTest(aRule, regexFromExts(residual));
        result.splice(i, 0, residualRule); // keep residual before B, or after—your choice
        i++; // skip over the newly inserted residual
      }

      replaced = true;
      break;
    }

    // If we didn’t overlap with any A rule, just add B
    if (!replaced) {
      result.push(bRule);
    }
  }

  return result;
}

/**
 * Creates a customizer function for unique plugins.
 * 
 * @param {string} key - The key to check for uniqueness
 * @param {string[]} pluginNames - Array of plugin constructor names to make unique
 * @param {Function} getter - Function to get the identifier from the plugin
 * @returns {Function} Customizer function
 */
function unique(key, pluginNames = [], getter = item => item.constructor && item.constructor.name) {
  return (a, b, k) => {
    if (k !== key) return undefined;

    const aItems = Array.isArray(a) ? a : [];
    const bItems = Array.isArray(b) ? b : [];

    // If not dealing with plugins, return undefined to use default merging
    if (key !== 'plugins') return undefined;

    // Create a map to track plugins by their identifier
    const uniquePlugins = new Map();

    // Process all plugins from both arrays
    [...aItems, ...bItems].forEach(plugin => {
      const id = getter(plugin);

      // If this is a plugin we want to make unique and we can identify it
      if (id && pluginNames.includes(id)) {
        uniquePlugins.set(id, plugin); // Keep only the last instance
      }
    });

    // Create the result array with all non-unique plugins from a
    const result = aItems.filter(plugin => {
      const id = getter(plugin);
      return !id || !pluginNames.includes(id) || uniquePlugins.get(id) === plugin;
    });

    // Add unique plugins from b that weren't already in the result
    bItems.forEach(plugin => {
      const id = getter(plugin);
      if (!id || !pluginNames.includes(id)) {
        result.push(plugin);
      } else if (uniquePlugins.get(id) === plugin) {
        result.push(plugin);
      }
    });

    return result;
  };
}

/**
 * Helper function to clean fields in an object based on omit paths.
 * Supports nested path strings like 'output.filename'.
 *
 * @param {Object} obj - The object to clean
 * @param {Object} options - Configuration options
 * @param {string[]} [options.omitPaths] - Paths to omit from the object (e.g., 'output.filename')
 * @param {Function} [options.warningFn] - Custom warning function that receives the path string
 * @returns {Object} The cleaned object with specified paths removed
 */
function cleanOmittedPaths(obj, options = {}) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const { omitPaths = [], warningFn } = options;

  // If no omit paths, return the original object
  if (!omitPaths.length) {
    return obj;
  }

  const result = { ...obj };

  // Process each omit path
  omitPaths.forEach(path => {
    // Convert path to array of keys
    const pathArray = Array.isArray(path) ? path : path.split('.');
    const pathString = Array.isArray(path) ? path.join('.') : path;

    // Start with the root object
    let current = result;
    let parent = null;
    let lastKey = null;

    // Traverse the path to find the target property
    for (let i = 0; i < pathArray.length - 1; i++) {
      const key = pathArray[i];
      if (current && typeof current === 'object' && key in current) {
        parent = current;
        lastKey = key;
        current = current[key];
      } else {
        // Path doesn't exist in the object, nothing to remove
        return;
      }
    }

    // Get the final key in the path
    const finalKey = pathArray[pathArray.length - 1];

    // Handle single-level paths (from root)
    if (pathArray.length === 1) {
      const rootKey = pathArray[0];
      if (rootKey in result) {
        // Log warning
        if (typeof warningFn === 'function') {
          warningFn(pathString);
        }
        delete result[rootKey];
      }
      return;
    }

    // If we found the property for nested paths, remove it
    if (parent && lastKey && finalKey) {
      if (current && typeof current === 'object' && finalKey in current) {
        // Log warning
        if (typeof warningFn === 'function') {
          warningFn(pathString);
        }
        delete current[finalKey];
      }
    }
  });

  return result;
}

/**
 * Normalizes externals configuration to ensure consistent handling.
 * @param {Object} config - The configuration object
 * @returns {Object} - The normalized configuration
 */
function normalizeExternals(config) {
  if (!config || !config.externals) return config;

  // Create a deep clone of the config to avoid modifying the original
  const result = { ...config };

  // If externals is not an array, convert it to an array
  if (!Array.isArray(result.externals)) {
    result.externals = [result.externals];
  }

  return result;
}

/**
 * Merges webpack/rspack configs with smart handling of overlapping rules.
 *
 * @param {...Object} configs - Configs to merge
 * @returns {Object} Merged config
 */
function mergeSplitOverlap(...configs) {
  // Normalize externals in all configs before merging
  const normalizedConfigs = configs.map(normalizeExternals);

  return mergeWithCustomize({
    customizeArray(a, b, key) {
      if (key === 'module.rules') {
        const aRules = Array.isArray(a) ? a : [];
        const bRules = Array.isArray(b) ? b : [];
        return splitOverlapRulesMerge(aRules, bRules);
      }

      // Ensure custom extensions first
      if (key === 'resolve.extensions') {
        const aRules = Array.isArray(a) ? a : [];
        const bRules = Array.isArray(b) ? b : [];
        const merged = [...bRules, ...aRules];
        return [...new Set(merged)];
      }

      // Handle plugins uniqueness
      if (key === 'plugins') {
        return unique(
          'plugins',
          ['HtmlRspackPlugin', 'RsdoctorRspackPlugin'],
          (plugin) => plugin.constructor && plugin.constructor.name
        )(a, b, key);
      }

      // fall through to default merging
      return undefined;
    }
  })(...normalizedConfigs);
}

module.exports = {
  EXT_CATALOG,
  unique,
  cleanOmittedPaths,
  mergeSplitOverlap
};

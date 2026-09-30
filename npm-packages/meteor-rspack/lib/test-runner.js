const path = require('node:path');

/**
 * Load a test provider's compiler adapter without interpreting its options.
 * Provider plans are JSON-safe; executable hooks are resolved in this process.
 *
 * The factory receives the current compiler instance and build flags. It can
 * supply runtime entry options, ignore patterns, Meteor flags, TypeScript
 * support, and a cache version. configureSwcRule runs on Meteor's SWC rule;
 * finalizeConfig runs after application configuration has been merged.
 *
 * @param {{adapter?: string, options?: Object}} context Provider build options.
 * @param {Object} build The project, target flags, and Rspack compiler instance.
 * @returns {Object} Provider-owned options and optional configuration hooks.
 */
function loadTestRunnerAdapter(context, build) {
  if (!context.adapter) return {};
  if (typeof context.adapter !== 'string' || !path.isAbsolute(context.adapter)) {
    throw new Error('[Meteor Rspack] Test runner adapter must be an absolute module path.');
  }
  const createAdapter = require(context.adapter);
  if (typeof createAdapter !== 'function') {
    throw new Error('[Meteor Rspack] Test runner adapter must export a function.');
  }
  const adapter = createAdapter({ ...build, options: context.options || {} });
  if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
    throw new Error('[Meteor Rspack] Test runner adapter must return build options.');
  }
  return adapter;
}

module.exports = { loadTestRunnerAdapter };

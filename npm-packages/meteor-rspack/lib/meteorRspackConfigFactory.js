// meteorRspackConfigFactory.js

const { mergeSplitOverlap } = require("./mergeRulesSplitOverlap.js");

const DEFAULT_PREFIX = "meteorRspackConfig";
let counter = 0;

/**
 * Create a uniquely keyed Rspack config fragment.
 * Example return: { meteorRspackConfig1: { ...customConfig } }
 *
 * @param {object} customConfig
 * @param {{ key?: number|string, prefix?: string }} [opts]
 * @returns {Record<string, object>}
 */
function prepareMeteorRspackConfig(customConfig, opts = {}) {
  if (!customConfig || typeof customConfig !== "object") {
    throw new TypeError("customConfig must be an object");
  }
  const prefix = opts.prefix || DEFAULT_PREFIX;

  let name;
  if (opts.key != null) {
    const k = String(opts.key).trim();
    if (/^\d+$/.test(k)) name = `${prefix}${k}`;
    else if (k.startsWith(prefix) && /^\d+$/.test(k.slice(prefix.length)))
      name = k;
    else
      throw new Error(`opts.key must be a positive integer or "${prefix}<n>"`);

    const n = parseInt(name.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > counter) counter = n;
  } else {
    counter += 1;
    name = `${prefix}${counter}`;
  }

  return { [name]: customConfig };
}

/**
 * Merge all `{prefix}<n>` fragments into `config` using `mergeSplitOverlap`,
 * then remove those temporary keys. Mutates `config`.
 *
 * Position-aware merge:
 * Walk the config in insertion order and fold:
 *   - for a fragment key:  out = mergeSplitOverlap(out, fragment)
 *   - for a normal key:    out = mergeSplitOverlap(out, { [key]: value })
 *
 * Result: fragments behave like spreads at their exact position;
 * later inline keys override earlier ones (including fragments).
 *
 * @param {object} config
 * @param {{ prefix?: string }} [opts]
 * @returns {object} same (mutated) config
 */
function mergeMeteorRspackFragments(config, opts = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("config must be a plain object");
  }
  const prefix = opts.prefix || DEFAULT_PREFIX;

  let out = {};
  for (const key of Object.keys(config)) {
    const val = config[key];

    const isFragment =
      typeof key === "string" &&
      key.startsWith(prefix) &&
      /^\d+$/.test(key.slice(prefix.length));

    if (isFragment) {
      if (!val || typeof val !== "object" || Array.isArray(val)) {
        throw new Error(`Fragment "${key}" must be a plain object`);
      }
      out = mergeSplitOverlap(out, val);
    } else {
      out = mergeSplitOverlap(out, { [key]: val });
    }
  }

  // keep object identity; fragments disappear because `out` doesn't include them
  replaceObject(config, out);
  return config;
}

function replaceObject(target, source) {
  for (const k of Object.keys(target)) {
    if (!(k in source)) delete target[k];
  }
  for (const k of Object.keys(source)) {
    target[k] = source[k];
  }
}

module.exports = {
  prepareMeteorRspackConfig,
  mergeMeteorRspackFragments,
};

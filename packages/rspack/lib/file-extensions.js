/**
 * Extensions owned by the default Rspack integration when Meteor must retain
 * selected compiler inputs instead of ignoring whole application directories.
 *
 * Keep this list bounded to formats Rspack handles without an optional custom
 * loader. Meteor only scans files matched by an active source processor, so
 * enumerating every extension present on disk adds ignore patterns without
 * removing work from Meteor.
 */
export const RSPACK_EXTENSIONS_TO_IGNORE = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".wasm",
  ".css",
];

/**
 * Returns a fresh, deterministic extension list without inspecting the app.
 * Optional formats such as HTML, Less, Sass, Stylus, CoffeeScript, Vue, and
 * Svelte remain available to their Meteor compilers unless Rspack delegates
 * them after its first compilation.
 *
 * @returns {string[]} Extensions that Meteor should ignore
 */
export function getRspackFileExtensionsToIgnore() {
  return [...RSPACK_EXTENSIONS_TO_IGNORE];
}

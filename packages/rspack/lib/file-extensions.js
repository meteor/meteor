import path from "path";

const BASE_RSPACK_EXTENSIONS = [
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
];

const EXTENSION_SCAN_IGNORES = [
  "node_modules/**",
  ".meteor/**",
  ".git/**",
  "public/**",
  "private/**",
];

function normalizeContext(context) {
  return context
    ?.replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

/**
 * Discovers extensions that Rspack should own without scanning generated or
 * non-source directories. The baseline covers files added after startup.
 *
 * @param {Object} options
 * @param {Function} options.globSync - Synchronous glob implementation
 * @param {string} options.cwd - Meteor application directory
 * @param {string[]} options.generatedContexts - Generated Rspack directories
 * @param {string[]} options.compilerExtensions - Extensions owned by Meteor
 * @returns {string[]} Extensions that Meteor should ignore
 */
export function discoverRspackFileExtensions({
  globSync,
  cwd,
  generatedContexts = [],
  compilerExtensions = [],
}) {
  const ignore = Array.from(
    new Set([
      ...EXTENSION_SCAN_IGNORES,
      ...generatedContexts
        .map(normalizeContext)
        .filter(Boolean)
        .map((context) => `${context}/**`),
    ]),
  );
  const files = globSync("**/*", {
    cwd,
    nodir: true,
    dot: true,
    ignore,
  });
  const meteorCompilerExtensions = new Set(
    compilerExtensions.map((extension) => extension.toLowerCase()),
  );
  const extensions = new Set(BASE_RSPACK_EXTENSIONS);

  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (extension) {
      extensions.add(extension);
    }
  }

  return Array.from(extensions).filter((extension) => !meteorCompilerExtensions.has(extension));
}

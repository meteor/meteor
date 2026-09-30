/**
 * @module logging
 * @description Functions for logging Rspack processes
 */

const { logRaw } = require("meteor/tools-core/lib/log");

const {
  isMeteorAppConfigModernVerbose,
  isMeteorAppProfile,
} = require("meteor/tools-core/lib/meteor");

/**
 * Checks if the logs should be verbose for Rspack processes.
 * @returns {boolean} True if profiling or verbose mode is enabled, false otherwise.
 */
export function shouldLogVerbose() {
  return isMeteorAppProfile() || isMeteorAppConfigModernVerbose();
}

/**
 * Strips the leading label line (e.g. "[server-rspack]:\n") from Rspack output.
 * @param {string} output - The raw output from an Rspack process
 * @returns {string} The output without the leading label line, trimmed
 */
export function stripRspackLabel(output) {
  return output.replace(/^\[.*?]:\s*\n/, "").trim();
}

/**
 * Parses and extracts [Meteor-Rspack]{}[/Meteor-Rspack] content from data.
 * Returns the cleaned data (without the tag content) and the parsed JSON config.
 * @param {string} data - The raw data that may contain Meteor-Rspack tags
 * @returns {{ cleanedData: string, config: Object|null }} Object with cleaned data and parsed config
 */
export function parseMeteorRspackOutput(data) {
  const tagRegex = /\[Meteor-Rspack\](.*?)\[\/Meteor-Rspack\]/g;
  let config = null;
  let match;

  // Find all matches and parse the last one (in case of multiple)
  while ((match = tagRegex.exec(data)) !== null) {
    try {
      config = JSON.parse(match[1]);
    } catch (e) {
      // If JSON parsing fails, keep config as null
      config = null;
    }
  }

  // Remove all [Meteor-Rspack]...[/Meteor-Rspack] tags from the data
  const cleanedData = data.replace(tagRegex, "").trim();

  return { cleanedData, config };
}

const compilationCount = {};
let hmrServerLogged = false;

/**
 * Logs "=> Started Rspack HMR server at <devServerUrl>" if devServerUrl exists in config.
 * Only logs once per session.
 * @param {Object|null} config - The parsed config from MeteorRspackOutputPlugin
 */
export function logHmrServerStarted(config) {
  if (hmrServerLogged) return;
  if (!config?.devServerUrl) return;
  hmrServerLogged = true;
  logRaw(`=> Started Rspack HMR server at ${config.devServerUrl}/`);
}

/**
 * Logs a friendly Meteor-style message with the raw Rspack output appended.
 * Strips the leading label and logs as:
 *   "=> Compiled your client app compiled successfully in 342 ms"
 * Adds a leading newline from the second compilation onwards per target.
 * @param {string} output - The raw stdout line from an Rspack process
 * @param {string} target - The build target label (e.g. "client", "server")
 * @param {boolean} statsOverrided - If true, skip cleaning and use \n separator
 */
export function logCompilationOutput(output, target, statsOverrided = false) {
  let cleaned;
  let separator;
  // Logs original Rspack logging when stats overrided by user
  if (statsOverrided) {
    cleaned = stripRspackLabel(output);
    separator = "\n";
  } else {
    cleaned = stripRspackLabel(output)
      .replace(/^.*\[.*?]\s*/g, "")
      .trim()
      .replace(/\s*compiled\s*/g, "");
    separator = cleaned.includes("\n") ? ":\n" : " ";
    // Ignore successful logs on default Meteor-Rspack logging
    if (/\s*successfully\s*/g.test(cleaned)) return;
  }
  compilationCount[target] = (compilationCount[target] || 0) + 1;
  const prefix = compilationCount[target] > 1 ? "\n=>" : "=>";
  logRaw(`${prefix} Compiled Rspack ${target} app${separator}${cleaned}`);
}

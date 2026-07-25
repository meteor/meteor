// Check if colors should be disabled
const shouldDisableColors = !!process.env.METEOR_DISABLE_COLORS;

// Minimum message length for consistent log formatting
const MIN_MESSAGE_LENGTH = 80;

// ANSI color codes
const colors = {
  reset: shouldDisableColors ? "" : "\x1b[0m",
  blue: shouldDisableColors ? "" : "\x1b[34m",
  red: shouldDisableColors ? "" : "\x1b[31m",
  purple: shouldDisableColors ? "" : "\x1b[35m",
  green: shouldDisableColors ? "" : "\x1b[32m",
  cyan: shouldDisableColors ? "" : "\x1b[36m",
};

/**
 * Pad a message to ensure it has a minimum length
 * @param {string} message - The message to pad
 * @param {number} minLength - The minimum length (default: MIN_MESSAGE_LENGTH)
 * @returns {string} The padded message
 */
export function padMessage(message, minLength = MIN_MESSAGE_LENGTH) {
  if (message.length >= minLength) {
    return message;
  }
  return message.padEnd(minLength);
}

/**
 * Log a progress message in blue
 * @param {string} message - The message to log
 */
export function logProgress(message) {
  console.log(`${colors.blue}${padMessage(message)}${colors.reset}`);
}

/**
 * Log an error message in red
 * @param {string} message - The message to log
 */
export function logError(message) {
  console.error(`${colors.red}${padMessage(message)}${colors.reset}`);
}

/**
 * Log an info message in cyan
 * @param {string} message - The message to log
 */
export function logInfo(message) {
  console.log(`${colors.cyan}${padMessage(message)}${colors.reset}`);
}

/**
 * Log a raw message without any color
 * @param {string} message - The message to log
 */
export function logRaw(message) {
  console.log(padMessage(message));
}

/**
 * Log a success message in green
 * @param {string} message - The message to log
 */
export function logSuccess(message) {
  console.log(`${colors.green}${padMessage(message)}${colors.reset}`);
}

/**
 * Get the runLogInstance from the Plugin object if it exists
 * @returns {Object|undefined} The runLogInstance or undefined
 */
export function getRunLog() {
  if (typeof Plugin !== 'undefined') {
    return Plugin.runLogInstance;
  }
  return undefined;
}

// Check if colors should be disabled
const shouldDisableColors = !!process.env.METEOR_DISABLE_COLORS;

// ANSI color codes
const colors = {
  reset: shouldDisableColors ? '' : '\x1b[0m',
  blue: shouldDisableColors ? '' : '\x1b[34m',
  red: shouldDisableColors ? '' : '\x1b[31m',
  purple: shouldDisableColors ? '' : '\x1b[35m',
  green: shouldDisableColors ? '' : '\x1b[32m'
};

/**
 * Log a progress message in blue
 * @param {string} message - The message to log
 */
export function logProgress(message) {
  console.log(`${colors.blue}${message}${colors.reset}`);
}

/**
 * Log an error message in red
 * @param {string} message - The message to log
 */
export function logError(message) {
  console.error(`${colors.red}${message}${colors.reset}`);
}

/**
 * Log an info message in purple
 * @param {string} message - The message to log
 */
export function logInfo(message) {
  console.log(`${colors.purple}${message}${colors.reset}`);
}

/**
 * Log a success message in green
 * @param {string} message - The message to log
 */
export function logSuccess(message) {
  console.log(`${colors.green}${message}${colors.reset}`);
}

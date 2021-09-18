const {
  PUBLIC,
  PRIVATE,
  CLIENT,
  SERVER,
  PACKAGE,
  TEST,
  NODE_MODULE,
  UNIVERSAL,
  PACKAGE_CONFIG,
  MOBILE_CONFIG,
  COMPATIBILITY,
  NON_METEOR,
} = require('../environment');

/**
 * Transforms an environment into executors
 * @param {ENVIRONMENT} env An Environment
 * @return {Set} A Set of executors
 */
module.exports = function getExecutorsByEnv(env) {
  const executors = new Set();
  switch (env) {
    case CLIENT:
    case COMPATIBILITY:
      executors.add('browser');
      executors.add('cordova');
      break;
    case SERVER:
      executors.add('server');
      break;
    case UNIVERSAL:
      executors.add('server');
      executors.add('browser');
      executors.add('cordova');
      break;
    case PACKAGE_CONFIG:
    case MOBILE_CONFIG:
    case PUBLIC:
    case PRIVATE:
    case TEST:
    case NODE_MODULE:
    case NON_METEOR:
    case PACKAGE:
    default:
      break;
  }
  return executors;
};

/**
 * @module constants
 * @description Constants and global state keys for Rstest plugin
 */

const DEFAULT_METEOR_RSTEST_VERSION = '0.1.0-beta.0';
const DEFAULT_RSTEST_VERSION = '0.11.6';

const GLOBAL_STATE_KEYS = {
  RSTEST_INSTALLATION_CHECKED: 'rstest.rstestInstallationChecked',
};

module.exports = {
  DEFAULT_METEOR_RSTEST_VERSION,
  DEFAULT_RSTEST_VERSION,
  GLOBAL_STATE_KEYS,
};

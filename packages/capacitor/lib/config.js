/**
 * @module config
 * @description Meteor package.json config parsing for Capacitor integration.
 */

const { logInfo } = require('meteor/tools-core/lib/log');

export const CAPACITOR_HCP_MODES = ['webapp', 'none'];
export const DEFAULT_CAPACITOR_HCP_MODE = 'webapp';

function getMeteorConfig() {
  return typeof Plugin !== 'undefined' && Plugin.getMeteorConfig
    ? Plugin.getMeteorConfig()
    : {};
}

export function getRawCapacitorConfig(config = getMeteorConfig()) {
  return config?.capacitor || {};
}

export function getCapacitorHcpMode(config = getMeteorConfig()) {
  const raw = getRawCapacitorConfig(config).hcp;
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_CAPACITOR_HCP_MODE;
  }
  if (raw === true) {
    return 'webapp';
  }
  if (raw === false) {
    return 'none';
  }

  if (CAPACITOR_HCP_MODES.includes(raw)) {
    return raw;
  }

  logInfo(
    `=> ⚠️ meteor.capacitor.hcp must be one of ${CAPACITOR_HCP_MODES.join(', ')} ` +
      `(got "${raw}"). Falling back to "${DEFAULT_CAPACITOR_HCP_MODE}".`
  );
  return DEFAULT_CAPACITOR_HCP_MODE;
}

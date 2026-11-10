/** Declare Capacitor's host-app dependencies using the shared tools-core engine. */
const { ensurePackageDependencies } = require('meteor/tools-core/lib/deps');
const {
  DEFAULT_CAPACITOR_VERSION,
  DEFAULT_METEOR_CAPACITOR_VERSION,
  CAPACITOR_PLATFORMS,
} = require('./constants');

const BASE_DEPENDENCIES = [
  { name: '@capacitor/core', version: DEFAULT_CAPACITOR_VERSION, dev: false },
  { name: '@capacitor/cli', version: DEFAULT_CAPACITOR_VERSION, dev: true },
  { name: '@meteorjs/capacitor', version: DEFAULT_METEOR_CAPACITOR_VERSION, dev: true },
];

const PLATFORM_DEPENDENCIES = {
  android: { name: '@capacitor/android', version: DEFAULT_CAPACITOR_VERSION, dev: false },
  ios: { name: '@capacitor/ios', version: DEFAULT_CAPACITOR_VERSION, dev: false },
};

export function getCapacitorDependenciesForPlatforms(platforms) {
  const selectedPlatforms = platforms
    ? Array.from(new Set(platforms)).filter(platform => CAPACITOR_PLATFORMS.includes(platform))
    : CAPACITOR_PLATFORMS;

  return [
    ...BASE_DEPENDENCIES,
    ...selectedPlatforms.map(platform => PLATFORM_DEPENDENCIES[platform]),
  ].map(dependency => ({
    ...dependency,
    // Preserve Capacitor's requirements: native packages are runtime deps,
    // and the CLI must be installed before we try to execute it.
    requireDeclaredSection: true,
    requireInstalled: true,
  }));
}

export async function ensureCapacitorInstalled({ platforms = null } = {}) {
  const dependencies = getCapacitorDependenciesForPlatforms(platforms);
  return ensurePackageDependencies({
    // A later platform request in the same command needs its own check.
    packageId: `capacitor:${dependencies.map(dep => dep.name).sort().join(',')}`,
    packageLabel: 'Capacitor',
    dependencies,
    docUrl: 'https://docs.meteor.com/about/native-stack/capacitor-mobile',
  });
}

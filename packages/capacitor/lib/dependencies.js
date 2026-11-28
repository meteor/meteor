/** Declare Capacitor's host-app dependencies using the shared tools-core engine. */
const { detectMissingOrOutdatedDeps, ensurePackageDependencies } = require('meteor/tools-core/lib/deps');
const { getMeteorAppDir } = require('meteor/tools-core/lib/meteor');
const fs = require('fs');
const path = require('path');
const semver = require('semver');
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
    // Use the shared minimum-version policy, accepting either dependency section.
    semverCondition: 'gte',
    requireInstalled: true,
  }));
}

function readInstalledPackage(appDir, name) {
  let directory = appDir;
  while (true) {
    const manifest = path.join(directory, 'node_modules', name, 'package.json');
    if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function validateCapacitorStack(dependencies) {
  const appDir = getMeteorAppDir();
  const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  const supported = '>=8.0.0 <9.0.0';
  const problems = [];
  for (const { name } of dependencies.filter(dep => dep.name.startsWith('@capacitor/'))) {
    for (const section of ['dependencies', 'devDependencies']) {
      const declared = manifest[section]?.[name];
      if (!declared) continue;
      const local = /^(file|link|portal|workspace):/.test(declared);
      if (!local && (!semver.validRange(declared) ||
          !semver.satisfies(semver.minVersion(declared), supported) ||
          semver.intersects(declared, '<8.0.0 || >=9.0.0'))) {
        problems.push(`${name} declares ${declared}; use a range within Capacitor 8`);
      }
    }
    const installed = readInstalledPackage(appDir, name);
    if (installed && !semver.satisfies(installed.version, supported)) {
      problems.push(`${name} has installed version ${installed.version}; install Capacitor 8`);
    }
  }
  // Plugin versions have independent numbering. Check their actual core peer.
  // Validate peers against the core version the shared installer will provide.
  const coreDependency = dependencies.find(dep => dep.name === '@capacitor/core');
  const [coreStatus] = detectMissingOrOutdatedDeps([coreDependency], { cwd: appDir });
  const coreVersion = coreStatus.status === 'ok'
    ? readInstalledPackage(appDir, '@capacitor/core').version
    : coreDependency.version;
  const names = new Set([
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.devDependencies || {}),
  ]);
  for (const name of names) {
    const peer = readInstalledPackage(appDir, name)?.peerDependencies?.['@capacitor/core'];
    if (peer && !semver.satisfies(coreVersion, peer)) {
      problems.push(`${name} requires @capacitor/core ${peer}; choose a Capacitor 8 compatible release`);
    }
  }
  if (problems.length) {
    throw new Error(`Meteor supports Capacitor 8 only.\n${problems.join('\n')}\n` +
      'Update core, CLI, selected platform packages and compatible plugins together, then run npm install and npx cap migrate. ' +
      'Meteor will not migrate existing native projects automatically. ' +
      'See https://capacitorjs.com/docs/updating/8-0');
  }
}

export async function ensureCapacitorInstalled({ platforms = null } = {}) {
  const dependencies = getCapacitorDependenciesForPlatforms(platforms);
  validateCapacitorStack(dependencies);
  return ensurePackageDependencies({
    // A later platform request in the same command needs its own check.
    packageId: `capacitor:${dependencies.map(dep => dep.name).sort().join(',')}`,
    packageLabel: 'Capacitor',
    dependencies,
    docUrl: 'https://docs.meteor.com/about/native-stack/capacitor-mobile',
  });
}

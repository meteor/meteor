/**
 * @module dependencies
 * @description Functions for managing dependencies for Rstest plugin
 */

const {
  DEFAULT_METEOR_RSTEST_VERSION,
  DEFAULT_RSTEST_VERSION,
  DEFAULT_METEOR_RSTEST_JSDOM_VERSION,
  DEFAULT_METEOR_RSTEST_PLAYWRIGHT_VERSION,
  GLOBAL_STATE_KEYS,
} = require('./constants.js');

function getRstestDependencies(env = process.env) {
  return [
    {
      name: '@meteorjs/rstest',
      version: DEFAULT_METEOR_RSTEST_VERSION,
      spec: env.METEOR_RSTEST_NPM_SPEC || DEFAULT_METEOR_RSTEST_VERSION,
    },
    { name: '@rstest/core', version: DEFAULT_RSTEST_VERSION },
    { name: '@rstest/adapter-rspack', version: DEFAULT_RSTEST_VERSION },
    { name: '@rstest/browser', version: DEFAULT_RSTEST_VERSION },
    { name: '@rstest/coverage-istanbul', version: DEFAULT_RSTEST_VERSION },
    { name: '@rstest/playwright', version: DEFAULT_RSTEST_VERSION },
    { name: 'jsdom', version: DEFAULT_METEOR_RSTEST_JSDOM_VERSION },
    { name: 'playwright', version: DEFAULT_METEOR_RSTEST_PLAYWRIGHT_VERSION },
  ].map(dependency => ({
    ...dependency,
    spec: dependency.spec || dependency.version,
    semverCondition: 'eq',
    dev: true,
    exact: true,
  }));
}

function loadServices() {
  const globalState = require('meteor/tools-core/lib/global-state');
  const log = require('meteor/tools-core/lib/log');
  const meteor = require('meteor/tools-core/lib/meteor');
  const npm = require('meteor/tools-core/lib/npm');
  return {
    ...globalState,
    ...log,
    ...meteor,
    ...npm,
  };
}

function dependencyVersionMatches(dependency, appDir, services) {
  try {
    return services.checkNpmDependencyVersion(dependency.name, {
      cwd: appDir,
      versionRequirement: dependency.version,
      semverCondition: dependency.semverCondition,
      checkNodeModules: true,
    });
  } catch {
    return false;
  }
}

function isLocalDependencySpec(spec) {
  return typeof spec === 'string' &&
    /^(?:file:|link:|workspace:|\.{1,2}[\\/]|[\\/])/.test(spec);
}

function getDependencyInstallSpec(dependency, services, appDir) {
  if (dependency.spec !== dependency.version) return dependency.spec;
  let packageJson;
  try {
    packageJson = services.getMeteorAppPackageJson?.(appDir);
  } catch {}
  const declaredSpec = packageJson && [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ].map(section => packageJson[section]?.[dependency.name]).find(Boolean);
  return isLocalDependencySpec(declaredSpec) ? declaredSpec : dependency.spec;
}

async function ensureDependenciesInstalled(
  dependencies,
  globalStateKey,
  packageName,
  services,
  { appDir = services.getMeteorAppDir() } = {},
) {
  if (services.getGlobalState(globalStateKey, false)) return;

  const dependenciesToInstall = dependencies.filter(dependency =>
    !services.checkNpmDependencyExists(dependency.name, {
      cwd: appDir,
      checkNodeModules: true,
      nodeModulesOnly: true,
    }) ||
    !dependencyVersionMatches(dependency, appDir, services)
  );

  if (dependenciesToInstall.length > 0) {
    const dependencyStrings = dependenciesToInstall.map(dependency =>
      `${dependency.name}@${getDependencyInstallSpec(dependency, services, appDir)}`
    );
    const isYarn = process.env.YARN_ENABLED === 'true' ||
      (process.env.YARN_ENABLED === undefined && services.isYarnProject({ cwd: appDir }));

    services.logProgress(`=> 📦 ${packageName} Dependencies`);
    dependencyStrings.forEach(dependency => services.logInfo(`   • ${dependency}`));
    services.logProgress(
      `=> 🔧 Installing ${dependenciesToInstall.length} dev dependenc${
        dependenciesToInstall.length === 1 ? 'y' : 'ies'
      }...`
    );

    const installed = await services.installNpmDependency(dependencyStrings, {
      cwd: appDir,
      dev: true,
      exact: true,
      includeDevDependencies: true,
      yarn: isYarn,
    });

    if (!installed) {
      const installCommand = isYarn
        ? `yarn add --dev --exact ${dependencyStrings.join(' ')}`
        : `meteor npm install -D --save-exact --production=false ${dependencyStrings.join(' ')}`;
      services.logError(`=> ❌ Failed to install ${packageName}`);
      services.logError(`   For dev dependencies, run: ${installCommand}`);
      throw new Error(
        `Failed to install ${packageName} dev dependencies. ` +
        'Please install them manually with the command above.'
      );
    }

    services.logSuccess(`=> ✅ Installed ${packageName} dependencies`);
    if (services.isMeteorAppUpdate()) {
      services.logInfo(
        `=> 🔔 Remember: Run \`${isYarn ? 'yarn install' : 'npm install'}\` ` +
        'after the Meteor update finishes.'
      );
      services.logInfo('   This helps keep your dependencies correct and your project stable.');
    }
  }

  services.setGlobalState(globalStateKey, true);
}

async function ensureRstestInstalled({ env = process.env, services } = {}) {
  const resolvedServices = services || loadServices();
  await ensureDependenciesInstalled(
    getRstestDependencies(env),
    GLOBAL_STATE_KEYS.RSTEST_INSTALLATION_CHECKED,
    'Rstest',
    resolvedServices,
    { appDir: env.METEOR_RSTEST_NPM_ROOT || resolvedServices.getMeteorAppDir() },
  );
}

function shouldEnsureRstestDependencies({
  testRunner,
  isAppTestCommand,
  isPackagesTestCommand,
  autoInstallDeps,
}) {
  return testRunner === 'rstest' &&
    (isAppTestCommand || isPackagesTestCommand) &&
    autoInstallDeps;
}

module.exports = {
  GLOBAL_STATE_KEYS,
  ensureDependenciesInstalled,
  ensureRstestInstalled,
  getDependencyInstallSpec,
  getRstestDependencies,
  shouldEnsureRstestDependencies,
};

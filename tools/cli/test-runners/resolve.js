const VALID_RUNNERS = new Set(['rstest', 'driver']);
const COMPATIBILITY_RUNNERS = ['tinytest', 'meteortesting:mocha', 'practicalmeteor:mocha'];

function architectureMatches(actual, pattern) {
  return actual.startsWith(pattern) &&
    (actual.length === pattern.length || actual[pattern.length] === '.');
}

function referenceApplies(reference, architectures) {
  if (!architectures || architectures.length === 0 || !reference.arch) return true;
  return architectures.some(architecture => architectureMatches(architecture, reference.arch));
}

function hasStrongDependency(versionRecords, dependencyNames, architectures) {
  return versionRecords.some(record => {
    const dependencies = record && record.dependencies;
    return dependencies && dependencyNames.some(name => {
      const dependency = dependencies[name];
      return dependency && Array.isArray(dependency.references) &&
        dependency.references.some(reference =>
          !reference.weak && !reference.unordered &&
          referenceApplies(reference, architectures)
        );
    });
  });
}

function hasStrongRstestDependency(versionRecords, architectures) {
  return hasStrongDependency(versionRecords, ['rstest'], architectures);
}

function classifyPackageTestRunners(packages, architectures) {
  const classification = {
    rstestPackages: [],
    compatibilityPackages: [],
    conflictingPackages: [],
    unknownPackages: [],
    compatibilityGroups: {},
  };
  for (const entry of packages) {
    const hasRstest = hasStrongRstestDependency([entry.version], architectures);
    const compatibilityDrivers = COMPATIBILITY_RUNNERS
      .filter(name => hasStrongDependency([entry.version], [name], architectures))
      .map(name => name === 'tinytest' ? 'test-in-browser' : name);
    const uniqueCompatibilityDrivers = [...new Set(compatibilityDrivers)];
    const hasCompatibility = uniqueCompatibilityDrivers.length > 0;
    if (hasRstest && hasCompatibility || uniqueCompatibilityDrivers.length > 1) {
      classification.conflictingPackages.push(entry.name);
    } else if (hasRstest) {
      classification.rstestPackages.push(entry.name);
    } else if (hasCompatibility) {
      classification.compatibilityPackages.push(entry.name);
      const driver = uniqueCompatibilityDrivers[0];
      (classification.compatibilityGroups[driver] ||= []).push(entry.name);
    } else {
      classification.unknownPackages.push(entry.name);
    }
  }
  return classification;
}

function runnerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function resolvePackageTestRunner({ selection, packages, architectures }) {
  const {
    rstestPackages,
    compatibilityPackages,
    conflictingPackages,
    unknownPackages,
    compatibilityGroups,
  } = classifyPackageTestRunners(packages, architectures);

  if (selection.source !== 'legacy-default' && selection.engine !== 'rstest') {
    if (rstestPackages.length === 0 && conflictingPackages.length === 0) {
      return selection;
    }
    return {
      ...selection,
      warning:
        '[Meteor Rstest] Explicit driver selection takes precedence, but it will not execute ' +
        `Rstest-owned package tests: ${[...rstestPackages, ...conflictingPackages].join(', ')}.`,
    };
  }

  if (conflictingPackages.length > 0 || unknownPackages.length > 0) {
    const details = [
      conflictingPackages.length > 0
        ? `conflicting engines: ${conflictingPackages.join(', ')}`
        : null,
      unknownPackages.length > 0
        ? `unknown engines: ${unknownPackages.join(', ')}`
        : null,
    ].filter(Boolean).join('. ');
    throw runnerError(
      'METEOR_TEST_RUNNER_UNOWNED_PACKAGES',
      `[Meteor Rstest] Cannot safely select a package test engine (${details}). ` +
      'Add a strong ordered rstest or tinytest/Mocha dependency in Package.onTest, ' +
      'or select the package\'s real --driver-package explicitly.'
    );
  }

  if (rstestPackages.length > 0 && compatibilityPackages.length > 0) {
    throw runnerError(
      'METEOR_TEST_RUNNER_MIXED_PACKAGES',
      '[Meteor Rstest] Mixed Rstest and legacy package tests cannot share one beta test harness. ' +
      `Rstest packages: ${rstestPackages.join(', ')}. ` +
      `Driver packages: ${compatibilityPackages.join(', ')}. ` +
      `Run separately: meteor test-packages ${rstestPackages.join(' ')}; ` +
      Object.entries(compatibilityGroups).map(([driver, names]) =>
        `meteor test-packages --driver-package ${driver} ${names.join(' ')}`
      ).join('; ') + '.'
    );
  }

  const packageSelectsRstest = rstestPackages.length > 0;
  if (selection.engine === 'rstest' && !packageSelectsRstest) {
    throw runnerError(
      'METEOR_TEST_RUNNER_INCOMPATIBLE_PACKAGE',
      '[Meteor Rstest] Rstest was selected, but selected package tests do not strongly depend on rstest: ' +
      `${compatibilityPackages.join(', ')}. Run ` +
      Object.entries(compatibilityGroups).map(([driver, names]) =>
        `meteor test-packages --driver-package ${driver} ${names.join(' ')}`
      ).join('; ') + ', or add rstest in Package.onTest.'
    );
  }

  return {
    engine: packageSelectsRstest ? 'rstest' : 'driver',
    driverPackage: packageSelectsRstest
      ? 'rstest'
      : Object.keys(compatibilityGroups)[0] || 'test-in-browser',
    source: packageSelectsRstest ? 'selected-package-metadata' : 'legacy-default',
  };
}

function resolveTestRunner({
  command,
  explicitTestRunner,
  driverPackage,
  envTestRunner,
  packageJsonMeteor,
  hasRstestPackage,
}) {
  if (explicitTestRunner === 'rstest' && driverPackage) {
    throw runnerError(
      'METEOR_TEST_RUNNER_CONFLICT',
      '[Meteor Rstest] --test-runner rstest conflicts with --driver-package. Remove one selection.'
    );
  }

  if (driverPackage) {
    return { engine: 'driver', driverPackage, source: '--driver-package' };
  }

  const candidates = [
    [explicitTestRunner, '--test-runner'],
    [envTestRunner, 'METEOR_TEST_RUNNER'],
    [packageJsonMeteor && packageJsonMeteor.testRunner, 'package.json#meteor.testRunner'],
  ];
  const selected = candidates.find(([value]) => value != null);
  if (selected) {
    const [engine, source] = selected;
    if (!VALID_RUNNERS.has(engine)) {
      throw runnerError(
        'METEOR_TEST_RUNNER_INVALID',
        `[Meteor Rstest] Unknown test runner "${engine}" from ${source}. Expected "rstest" or "driver".`
      );
    }
    return {
      engine,
      driverPackage: engine === 'rstest'
        ? 'rstest'
        : command === 'test-packages' ? 'test-in-browser' : null,
      source,
    };
  }

  // App capability controls app tests only. Package tests run in a temporary
  // harness and must be selected from the packages actually under test.
  if (hasRstestPackage && command === 'test') {
    return { engine: 'rstest', driverPackage: 'rstest', source: 'atmosphere-package' };
  }

  return {
    engine: 'driver',
    driverPackage: command === 'test-packages' ? 'test-in-browser' : null,
    source: 'legacy-default',
  };
}

module.exports = {
  hasStrongRstestDependency,
  classifyPackageTestRunners,
  resolvePackageTestRunner,
  resolveTestRunner,
};

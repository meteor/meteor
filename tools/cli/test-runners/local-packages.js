function pathIsWithin(root, candidate, files) {
  const relative = files.pathRelative(root, candidate);
  return relative === '' || (
    !files.pathIsAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('../') &&
    !relative.startsWith('..\\')
  );
}

async function collectTestRunnerLocalPackages(
  localCatalog,
  files,
  {
    checkoutPackageRoots = [],
    selectedPackageNames = [],
    packageCatalog,
  } = {}
) {
  const localPackages = [];
  const resolvedCheckoutRoots = checkoutPackageRoots.map(root =>
    files.pathResolve(root)
  );
  const selectedNames = new Set(selectedPackageNames);
  const packageNames = await localCatalog.getAllPackageNames();
  for (const name of packageNames) {
    const packageSource = localCatalog.getPackageSource(name);
    if (!packageSource || !packageSource.sourceRoot) {
      continue;
    }
    const sourceRoot = files.pathResolve(packageSource.sourceRoot);
    if (!files.exists(sourceRoot)) {
      continue;
    }
    let sourceKind = resolvedCheckoutRoots.some(root =>
      pathIsWithin(root, sourceRoot, files)
    ) ? 'checkout' : 'project';
    if (selectedNames.has(name)) {
      sourceKind = 'test-target';
    }
    const sourceProcessors = new Set();
    for (const architecture of packageSource.architectures || []) {
      for (const use of architecture.uses || []) {
        const dependency = use && use.package;
        if (typeof dependency !== 'string' || !dependency) continue;
        const dependencySource = localCatalog.getPackageSource(dependency);
        if (dependencySource && dependencySource.pluginInfo &&
            Object.keys(dependencySource.pluginInfo).length === 0) {
          continue;
        }
        const version = packageCatalog &&
          await packageCatalog.getLatestVersion(dependency);
        if (version && version.containsPlugins) sourceProcessors.add(dependency);
      }
    }
    localPackages.push({
      name,
      sourceRoot,
      sourceKind,
      sourceProcessors: [...sourceProcessors].sort(),
    });
  }
  return localPackages.sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

module.exports = {
  collectTestRunnerLocalPackages,
};

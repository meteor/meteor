async function collectTestRunnerLocalPackages(localCatalog, files) {
  const localPackages = [];
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
    localPackages.push({ name, sourceRoot });
  }
  return localPackages.sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

module.exports = {
  collectTestRunnerLocalPackages,
};

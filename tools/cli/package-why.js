function isStrongDependency(dependency) {
  const references = dependency && dependency.references || [];
  return references.length === 0 ||
    !references.every(reference => reference.weak);
}

function isInternalDependency(packageName) {
  return packageName === 'meteor' ||
    /^isobuild:/.test(packageName);
}

function getStrongDependencies(packageRecord) {
  const dependencies = packageRecord && packageRecord.dependencies || {};
  return Object.keys(dependencies)
    .filter(packageName => !isInternalDependency(packageName))
    .filter(packageName => isStrongDependency(dependencies[packageName]))
    .sort();
}

function findShortestPath(packageRecords, rootName, targetName) {
  const queue = [[rootName]];
  const visited = new Set([rootName]);

  while (queue.length) {
    const path = queue.shift();
    const currentName = path[path.length - 1];

    if (currentName === targetName) {
      return path;
    }

    const packageRecord = packageRecords instanceof Map
      ? packageRecords.get(currentName)
      : packageRecords[currentName];

    for (const dependencyName of getStrongDependencies(packageRecord)) {
      const dependencyRecord = packageRecords instanceof Map
        ? packageRecords.get(dependencyName)
        : packageRecords[dependencyName];

      if (!dependencyRecord || visited.has(dependencyName)) {
        continue;
      }

      visited.add(dependencyName);
      queue.push(path.concat(dependencyName));
    }
  }

  return null;
}

exports.isStrongDependency = isStrongDependency;
exports.isInternalDependency = isInternalDependency;
exports.getStrongDependencies = getStrongDependencies;
exports.findShortestPath = findShortestPath;

exports.findPackageReasons = function (packageRecords, directDependencyNames, targetName) {
  const hasTarget = packageRecords instanceof Map
    ? packageRecords.has(targetName)
    : Object.prototype.hasOwnProperty.call(packageRecords, targetName);

  if (!hasTarget) {
    return { status: 'missing', paths: [] };
  }

  const paths = [];
  const roots = Array.from(directDependencyNames)
    .filter(rootName => rootName !== 'meteor')
    .filter(rootName => !/^isobuild:/.test(rootName))
    .filter(rootName => packageRecords instanceof Map
      ? packageRecords.has(rootName)
      : Object.prototype.hasOwnProperty.call(packageRecords, rootName))
    .sort();

  for (const rootName of roots) {
    const path = findShortestPath(packageRecords, rootName, targetName);
    if (path) {
      paths.push(path);
    }
  }

  return {
    status: paths.length ? 'found' : 'no-path',
    paths
  };
};

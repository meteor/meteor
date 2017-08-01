import { pathJoin, getDevBundle } from '../fs/files.js';
import { installNpmModule, moduleDoesResolve } from '../isobuild/meteor-npm.js';

export function ensureDependencies(deps) {
  // Check if each of the requested dependencies resolves, if not
  // mark them for installation.
  const needToInstall = Object.create(null);
  Object.keys(deps).forEach(dep => {
    if (!moduleDoesResolve(dep)) {
      const versionToInstall = deps[dep];
      needToInstall[dep] = versionToInstall;
    }
  });

  const devBundleLib = pathJoin(getDevBundle(), 'lib');

  // Install each of the requested modules.
  Object.keys(needToInstall)
    .forEach(dep => installNpmModule(dep, needToInstall[dep], devBundleLib));
}

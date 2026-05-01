import { pathJoin, getDevBundle, statOrNull } from '../fs/files';
import { batchInstallNpmModules } from '../isobuild/meteor-npm.js';

export async function ensureDependencies(deps) {
  const devBundleLib = pathJoin(getDevBundle(), 'lib');
  const devBundleNodeModules = pathJoin(devBundleLib, 'node_modules');

  const needToInstall = Object.create(null);
  Object.keys(deps).forEach(dep => {
    const pkgDir = pathJoin(devBundleNodeModules, dep);
    const pkgStat = statOrNull(pkgDir);
    const alreadyInstalled = pkgStat && pkgStat.isDirectory();
    if (!alreadyInstalled) {
      needToInstall[dep] = deps[dep];
    }
  });

  await batchInstallNpmModules(needToInstall, devBundleLib);
}

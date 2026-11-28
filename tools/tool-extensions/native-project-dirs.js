import path from 'node:path';
import { findProjectConfig, readPlatformPath } from './project-config.cjs';

export async function resolveNativeProjectDirs(extensions, appDir, getPlatformEnv, warn) {
  const dirs = new Set();
  for (const extension of extensions) {
    const settings = extension.nativeProjectConfig;
    const file = settings && findProjectConfig(appDir, settings.file);
    for (const platform of extension.platforms || []) {
      let dir = platform.nativeProjectDir;
      const keys = settings?.paths[platform.name];
      if (file && keys) {
        try {
          const platformEnv = getPlatformEnv(platform.name);
          if (settings.platformEnv) platformEnv[settings.platformEnv] = platform.name;
          dir = await readPlatformPath(file, keys, platformEnv) || dir;
        } catch {
          warn(`Could not read ${path.basename(file)} for ${platform.name}. Using the default native project directory.`);
        }
      }
      if (!dir) continue;
      const nativeDir = path.resolve(appDir, dir);
      // A native project can share the app root. Keep its sources visible in that case.
      const relative = path.relative(nativeDir, appDir);
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        dirs.add(nativeDir);
      }
    }
  }
  return [...dirs];
}

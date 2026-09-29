const fs = require('fs');
const os = require('os');
const path = require('path');

function hasTrustedCacheAncestors(directory) {
  if (!path.isAbsolute(directory)) return false;

  const uid = process.geteuid();
  let current = directory;
  while (true) {
    try {
      const stat = fs.lstatSync(current);
      if (
        !stat.isDirectory() ||
        (stat.uid !== uid && stat.uid !== 0) ||
        ((stat.mode & 0o022) !== 0 && (stat.mode & 0o1000) === 0)
      ) {
        return false;
      }
    } catch (error) {
      // SWC creates missing cache directories. Existing ancestors must still
      // be trusted; in particular a root container cannot trust a host-owned HOME.
      if (error.code !== 'ENOENT') return false;
    }

    const parent = path.dirname(current);
    if (parent === current) return true;
    current = parent;
  }
}

/**
 * Give Linux Rspack children an account-owned SWC cache when a mounted HOME or
 * XDG cache has incompatible ownership/permissions. SWC still validates the
 * chosen directory, filesystem and native payload itself.
 * @param {Object} env - The complete environment for a Rspack child.
 * @returns {Object} Environment with an optional SWC cache fallback.
 */
function withSwcNativeCache(env) {
  if (process.platform !== 'linux' || env.SWC_NATIVE_BINDING_CACHE !== undefined) {
    return env;
  }

  const defaultCache = path.isAbsolute(env.XDG_CACHE_HOME || '')
    ? env.XDG_CACHE_HOME
    : env.HOME && path.join(env.HOME, '.cache');
  if (!defaultCache || hasTrustedCacheAncestors(defaultCache)) return env;

  try {
    // Unlike os.homedir(), userInfo() reads the account database rather than
    // HOME, which Actions/devcontainers can replace with a host bind mount.
    const accountCache = path.join(os.userInfo().homedir, '.cache');
    if (hasTrustedCacheAncestors(accountCache)) {
      return { ...env, SWC_NATIVE_BINDING_CACHE: accountCache };
    }
  } catch {
    // Accounts without a resolvable home retain SWC's normal error handling.
  }

  return env;
}

module.exports = { withSwcNativeCache };

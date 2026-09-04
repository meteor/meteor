// Decide whether `meteor install` should abort because it was run as a local
// npm dependency install — i.e. someone added meteor to their package.json —
// rather than a global install, an npx / `npm exec` run, or a direct call of the
// installed `meteor-installer` binary, all of which are legitimate.
//
// npm sets npm_lifecycle_event while running a package's lifecycle scripts and
// npm_config_global='true' for a global install; a direct run of the installed
// binary has no npm_* variables at all.
function isLocalDependencyInstall(env = process.env) {
  const inNpmLifecycle = !!env.npm_lifecycle_event;
  const isGlobal = env.npm_config_global === 'true';
  const isNpx =
    env.npm_lifecycle_event === 'npx' || env.npm_command === 'exec';
  return inNpmLifecycle && !isGlobal && !isNpx;
}

module.exports = { isLocalDependencyInstall };

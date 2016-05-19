import files from '../fs/files.js';

const hookDestination =
  files.pathJoin(files.getCurrentToolsDir(), '.git', 'hooks');

const hookSource =
  files.pathJoin(files.getCurrentToolsDir(),
    'scripts', 'admin', 'git-hooks');

const allPossibleHooks = [
  'applypatch-msg',
  'pre-applypatch',
  'post-applypatch',
  'pre-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-rebase',
  'post-checkout',
  'post-merge',
  'pre-receive',
  'update',
  'post-update',
  'pre-auto-gc',
  'post-rewrite',
];

// A suffix that we append to our hook scripts
const METEOR_HOOK_SUFFIX = '.meteor-hook';

// Matches the whole line we inject into the user's hook
const METEOR_HOOK_LINE_REGEX = /.*meteor-hook.*/;

export default function installGitHooks() {

  if (!files.exists(hookDestination)) {
    // Don't do anything if the hook destination does not exist, eg.,
    // we are not running from a git clone.
    return;
  }

  allPossibleHooks.map((hookName) => {
    const hookFile = files.pathJoin(hookDestination, hookName);
    const sourceFile = files.pathJoin(hookSource, hookName);
    const meteorHookFile = hookFile + METEOR_HOOK_SUFFIX;

    if (!files.exists(sourceFile) && !files.exists(hookFile)) {
      // Don't do anything if this hook isn't in either list
      return;
    }

    if (!files.exists(sourceFile)) {
      // If the user has this hook, but Meteor doesn't, make sure that we remove
      // any hooks that we added previously
      removeMeteorInjectedHook(hookFile);
      return;
    }

    /* eslint-disable max-len */
    const METEOR_HOOK_INJECTED_LINE = `exec "$(dirname $0)/${hookName}${METEOR_HOOK_SUFFIX}" # Inserted by Meteor tool\n`;
    /* eslint-enable */

    if (!files.exists(hookFile)) {
      // If the user doesn't have this hook, but we want to add it, just insert
      // a new file and a line that calls it
      files.writeFile(hookFile,
        `#!/bin/sh
${METEOR_HOOK_INJECTED_LINE}`,
        { encoding: 'utf8', mode: 0o755 });

      // Copy the hook from the scripts dir
      files.writeFile(meteorHookFile, files.readFile(sourceFile),
        { mode: 0o755 });
      return;
    }

    // Now we have arrived at the case where the user already has a hook

    // Has Meteor already installed a hook here? If not, add a line to the hook
    if (!files.exists(meteorHookFile)) {
      files.appendFile(hookFile, METEOR_HOOK_INJECTED_LINE);
    }

    // Copy the hook from the scripts dir again in case it updated
    files.writeFile(meteorHookFile, files.readFile(sourceFile),
      { mode: 0o755 });
    return;
  });
}

function removeMeteorInjectedHook(hookFile) {
  // Remove the script added by Meteor
  try {
    files.unlink(hookFile + METEOR_HOOK_SUFFIX);
  } catch (err) {
    // Ignore errors about file not found
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  // Remove the line added to the file
  files.writeFile(hookFile,
    files.readFile(hookFile, 'utf8').replace(METEOR_HOOK_LINE_REGEX, ''),
    'utf8');
}

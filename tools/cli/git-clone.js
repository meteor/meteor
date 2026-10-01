var files = require('../fs/files');
const { execFile } = require('child_process');

function execGit(args, options = {}) {
  const env = Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' });
  return new Promise((resolve, reject) => {
    execFile('git', args, { env, ...options }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Resolve GitHub shorthand (user/repo) to a full URL.
 * If input matches `user/repo` with no protocol, expand to https://github.com/user/repo.
 * Otherwise return as-is.
 */
function isGitHubShorthand(input) {
  return typeof input === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*(?:\.git)?$/.test(input);
}

function isGitSourceLike(input, { githubShorthand = true } = {}) {
  if (typeof input !== 'string' || input.length === 0) {
    return false;
  }

  if (/^(?:https?|ssh|git|file):\/\//i.test(input)) {
    return true;
  }

  if (/^[^@\s]+@[^:\s]+:[^/\s]+\/[^\s]+$/.test(input)) {
    return true;
  }

  return githubShorthand && isGitHubShorthand(input);
}

function resolveRepoUrl(input) {
  if (isGitHubShorthand(input)) {
    return `https://github.com/${input}`;
  }
  return input;
}

/**
 * Parse a GitHub, GitLab, or Bitbucket tree/src URL into its components.
 * Returns { repoUrl, branch, dir } where branch and dir may be null.
 *
 * Explicit --from-branch / --from-dir flags should override the parsed values.
 *
 * Supported URL patterns:
 *   GitHub shorthand: owner/repo               -> https://github.com/owner/repo
 *   GitHub:    https://github.com/owner/repo/tree/branch[/path]
 *   GitLab:    https://gitlab.com/owner/repo/-/tree/branch[/path]
 *   Bitbucket: https://bitbucket.org/owner/repo/src/branch[/path]
 */
function parseGitUrl(url) {
  const result = { repoUrl: url, branch: null, dir: null };
  if (!url || typeof url !== 'string') return result;

  // Expand GitHub shorthand first so the rest of the pipeline sees a real URL.
  const expanded = resolveRepoUrl(url);
  result.repoUrl = expanded;

  // GitHub: https://github.com/owner/repo/tree/branch[/path]
  const ghMatch = expanded.match(
    /^(https?:\/\/github\.com\/[^/]+\/[^/]+)\/tree\/(.+)$/
  );
  if (ghMatch) {
    result.repoUrl = ghMatch[1];
    const rest = ghMatch[2];
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) {
      result.branch = decodeURIComponent(rest);
    } else {
      result.branch = decodeURIComponent(rest.slice(0, slashIdx));
      result.dir = rest.slice(slashIdx + 1).replace(/\/+$/, '') || null;
    }
    return result;
  }

  // GitLab: https://gitlab.com/owner/repo/-/tree/branch[/path]
  const glMatch = expanded.match(
    /^(https?:\/\/gitlab\.com\/[^/]+\/[^/]+)\/-\/tree\/(.+)$/
  );
  if (glMatch) {
    result.repoUrl = glMatch[1];
    const rest = glMatch[2];
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) {
      result.branch = decodeURIComponent(rest);
    } else {
      result.branch = decodeURIComponent(rest.slice(0, slashIdx));
      result.dir = rest.slice(slashIdx + 1).replace(/\/+$/, '') || null;
    }
    return result;
  }

  // Bitbucket: https://bitbucket.org/owner/repo/src/branch[/path]
  const bbMatch = expanded.match(
    /^(https?:\/\/bitbucket\.org\/[^/]+\/[^/]+)\/src\/(.+)$/
  );
  if (bbMatch) {
    result.repoUrl = bbMatch[1];
    const rest = bbMatch[2];
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) {
      result.branch = decodeURIComponent(rest);
    } else {
      result.branch = decodeURIComponent(rest.slice(0, slashIdx));
      result.dir = rest.slice(slashIdx + 1).replace(/\/+$/, '') || null;
    }
    return result;
  }

  return result;
}

async function cloneRepo(url, destPath, { branch = null } = {}) {
  try {
    await execGit(['--version']);
  } catch (e) {
    throw new Error('git is not installed');
  }

  const dest = files.convertToOSPath(destPath);

  if (branch) {
    // Try --branch first (works for branches and tags)
    try {
      await execGit(['clone', '--progress', '--branch', branch, url, dest]);
    } catch (branchError) {
      // --branch fails for commit hashes; clone then checkout
      await execGit(['clone', '--progress', url, dest]);
      await execGit(['checkout', branch], { cwd: dest });
    }
  } else {
    await execGit(['clone', '--progress', url, dest]);
  }

  await files.rm_recursive_async(files.pathJoin(destPath, '.git'));
}

async function cloneSubdirectory(repoUrl, branch, subdir, destPath) {
  const tempDir = files.mkdtemp('meteor-clone-');
  try {
    if (branch) {
      try {
        await execGit(['clone', '--progress', '--branch', branch, repoUrl, tempDir]);
      } catch (branchError) {
        // --branch fails for commit hashes; clone then checkout
        await execGit(['clone', '--progress', repoUrl, tempDir]);
        await execGit(['checkout', branch], { cwd: tempDir });
      }
    } else {
      await execGit(['clone', '--progress', repoUrl, tempDir]);
    }

    const path = require('path');
    const resolvedTemp = path.resolve(tempDir) + path.sep;
    const subdirPath = path.resolve(files.pathJoin(tempDir, subdir));
    if (!subdirPath.startsWith(resolvedTemp)) {
      throw new Error(
        `Invalid subdirectory '${subdir}': path escapes the repository.`
      );
    }
    if (!files.exists(subdirPath)) {
      throw new Error(
        `Directory '${subdir}' not found in the repository.`
      );
    }

    await files.cp_r(subdirPath, destPath);

    // Remove .git if it was copied
    const destGit = files.pathJoin(destPath, '.git');
    if (files.exists(destGit)) {
      await files.rm_recursive_async(destGit);
    }
  } finally {
    await files.rm_recursive_async(tempDir);
  }
}

/**
 * Validate that dirPath contains a package.js with Package.describe.
 * Returns { name } parsed from the Package.describe call, or { name: null }
 * if the call is present but the name cannot be parsed.
 */
function validatePackageJs(dirPath) {
  const packageJsPath = files.pathJoin(dirPath, 'package.js');
  if (!files.exists(packageJsPath)) {
    throw new Error(
      `The cloned directory is not a valid Meteor package (no package.js found in '${files.convertToOSPath(dirPath)}').`
    );
  }
  const contents = files.readFile(packageJsPath, 'utf8');
  if (!/Package\s*\.\s*describe\s*\(/.test(contents)) {
    throw new Error(
      `The cloned directory is not a valid Meteor package (package.js does not contain Package.describe in '${files.convertToOSPath(dirPath)}').`
    );
  }
  const nameMatch = contents.match(
    /Package\s*\.\s*describe\s*\(\s*\{[\s\S]*?\bname\s*:\s*(['"`])([^'"`]+)\1/
  );
  return { name: nameMatch ? nameMatch[2] : null };
}

module.exports = {
  isGitSourceLike,
  resolveRepoUrl,
  parseGitUrl,
  cloneRepo,
  cloneSubdirectory,
  validatePackageJs,
};

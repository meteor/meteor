var files = require('../fs/files');
var httpHelpers = require('../utils/http-helpers.js');
var Console = require('../console/console.js').Console;
const { execFile } = require('child_process');

const EXAMPLES_REPO = 'https://github.com/meteor/examples';
const EXAMPLES_BRANCH = 'migrate-examples';
const EXAMPLES_JSON_URL =
  `https://raw.githubusercontent.com/meteor/examples/${EXAMPLES_BRANCH}/examples.json`;

function validateExamplesData(data, { warn = (msg) => Console.warn(msg) } = {}) {
  if (!Array.isArray(data)) {
    throw new Error('Invalid examples.json format: expected a JSON array.');
  }
  return data.filter(entry => {
    if (!entry.slug || typeof entry.slug !== 'string') {
      warn('Skipping example entry with missing slug');
      return false;
    }
    if (!entry.repositoryUrl || typeof entry.repositoryUrl !== 'string') {
      warn(`Skipping example '${entry.slug}' with missing repositoryUrl`);
      return false;
    }
    return true;
  });
}

function getCachePath() {
  var tropohouse = require('../packaging/tropohouse.js');
  return files.pathJoin(tropohouse.default.root, 'examples-cache.json');
}

function readCache() {
  const cachePath = getCachePath();
  if (!files.exists(cachePath)) return null;
  try {
    const raw = files.readFile(cachePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeCache(data) {
  try {
    const cachePath = getCachePath();
    files.writeFile(cachePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    // Don't fail the command if it can't write
  }
}

async function fetchExamplesJson() {
  const result = await httpHelpers.request({
    url: EXAMPLES_JSON_URL,
    method: 'GET',
  });
  if (result.response.statusCode !== 200) {
    throw new Error(
      `Failed to fetch examples.json (HTTP ${result.response.statusCode})`
    );
  }
  let data;
  try {
    data = JSON.parse(result.body);
  } catch (e) {
    throw new Error('Invalid JSON received from examples repository.');
  }
  return validateExamplesData(data);
}

async function getExamples({ refresh = false } = {}) {
  // Always try network first, use cache as fallback for offline
  try {
    const examples = await fetchExamplesJson();

    if (examples.length === 0) {
      throw new Error('No valid examples found in examples.json.');
    }

    writeCache({
      fetchedAt: new Date().toISOString(),
      branch: EXAMPLES_BRANCH,
      examples,
    });

    return examples;
  } catch (fetchError) {
    // When refresh is requested, don't fall back to stale cache
    if (refresh) {
      throw fetchError;
    }

    // Network failed — fall back to cache if available
    const cached = readCache();
    if (cached && cached.examples) {
      return cached.examples;
    }

    // No cache either — surface the original fetch error
    throw fetchError;
  }
}

function findExample(examples, slug) {
  return examples.find(e => e.slug === slug) || null;
}

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
  const tempDir = files.mkdtemp('meteor-example-');
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
        `Directory '${subdir}' not found in the repository. The examples list may be outdated — try 'meteor create --list' to see current examples.`
      );
    }

    await files.cp_r(subdirPath, destPath);

    // Remove .git if it was copied
    const destGit = files.pathJoin(destPath, '.git');
    if (files.exists(destGit)) {
      await files.rm_recursive_async(destGit);
    }
  } finally {
    // Clean up temp directory
    await files.rm_recursive_async(tempDir);
  }
}

/**
 * Parse a GitHub, GitLab, or Bitbucket tree/src URL into its components.
 * Returns { repoUrl, branch, dir } where branch and dir may be null.
 *
 * Explicit --from-branch / --from-dir flags should override the parsed values.
 *
 * Supported URL patterns:
 *   GitHub:    https://github.com/owner/repo/tree/branch[/path]
 *   GitLab:    https://gitlab.com/owner/repo/-/tree/branch[/path]
 *   Bitbucket: https://bitbucket.org/owner/repo/src/branch[/path]
 */
function parseGitUrl(url) {
  const result = { repoUrl: url, branch: null, dir: null };
  if (!url || typeof url !== 'string') return result;

  // GitHub: https://github.com/owner/repo/tree/branch[/path]
  const ghMatch = url.match(
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
  const glMatch = url.match(
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
  const bbMatch = url.match(
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

function validateMeteorApp(dirPath) {
  const meteorDir = files.pathJoin(dirPath, '.meteor');
  if (!files.exists(meteorDir)) {
    throw new Error(
      `The directory '${files.convertToOSPath(dirPath)}' is not a Meteor app (no .meteor directory found).`
    );
  }
}

module.exports = {
  validateExamplesData,
  getExamples,
  findExample,
  cloneRepo,
  cloneSubdirectory,
  parseGitUrl,
  validateMeteorApp,
  EXAMPLES_REPO,
  EXAMPLES_BRANCH,
  EXAMPLES_JSON_URL
};

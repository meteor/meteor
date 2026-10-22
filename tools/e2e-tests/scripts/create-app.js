#!/usr/bin/env node

/**
 * Script to create a Meteor test app for manual testing without automatic cleanup.
 *
 * Sources apps from:
 *   - tools/e2e-tests/apps/<name>  (use --app flag)
 *   - meteor create --<skeleton>      (use --skeleton flag)
 *
 * Usage:
 *   npm run create-app:e2e -- --app react
 *   npm run create-app:e2e -- --app react --output ./dist/my-react-app
 *   npm run create-app:e2e -- --app monorepo --monorepo
 *   npm run create-app:e2e -- --skeleton react
 *   npm run create-app:e2e -- --skeleton react --output ./my-apps/custom-name
 */

const path = require('path');
const fs = require('fs-extra');
const execa = require('execa');
const { linkLocalRspack } = require('./link-rspack');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const METEOR_EXECUTABLE = path.join(REPO_ROOT, 'meteor');
const E2E_TESTS_DIR = path.join(__dirname, '..');
const APPS_DIR = path.join(E2E_TESTS_DIR, 'apps');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'dist');

// ANSI color helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};
const log = {
  step: (msg) => console.log(`${c.cyan}>${c.reset} ${msg}`),
  success: (msg) => console.log(`${c.green}>${c.reset} ${msg}`),
  info: (msg) => console.log(`${c.blue}>${c.reset} ${msg}`),
  warn: (msg) => console.log(`${c.yellow}>${c.reset} ${msg}`),
  error: (msg) => console.error(`${c.red}>${c.reset} ${msg}`),
  detail: (msg) => console.log(`  ${c.dim}${msg}${c.reset}`),
};

function parseArgs(argv) {
  const args = { monorepo: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--app') {
      args.app = argv[++i];
    } else if (argv[i] === '--skeleton') {
      args.skeleton = argv[++i];
    } else if (argv[i] === '--output') {
      args.output = argv[++i];
    } else if (argv[i] === '--monorepo') {
      args.monorepo = true;
    } else if (argv[i] === '--force' || argv[i] === '-f') {
      args.force = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  const availableApps = fs.existsSync(APPS_DIR)
    ? fs.readdirSync(APPS_DIR).join(', ')
    : '(none found)';

  console.log(`
${c.bold}Usage:${c.reset} npm run create-app:e2e -- [options]

${c.bold}Options:${c.reset}
  ${c.cyan}--app${c.reset} <name>       Copy an existing app from tools/e2e-tests/apps/
  ${c.cyan}--skeleton${c.reset} <name>  Create a new app via "meteor create --<name>"
  ${c.cyan}--output${c.reset} <path>    Full destination path for the app (default: ./dist/<appName>)
  ${c.cyan}--monorepo${c.reset}         Treat the app as a monorepo (runs npm install at both root and app/ levels)
  ${c.cyan}--force${c.reset}, ${c.cyan}-f${c.reset}        Remove the destination directory if it already exists before creating the app
  ${c.cyan}--help${c.reset}, ${c.cyan}-h${c.reset}         Show this help message

${c.bold}Available apps:${c.reset} ${c.green}${availableApps}${c.reset}

${c.bold}Examples:${c.reset}
  ${c.dim}npm run create-app:e2e -- --app react${c.reset}
  ${c.dim}npm run create-app:e2e -- --app react --output ./dist/my-react-app${c.reset}
  ${c.dim}npm run create-app:e2e -- --app monorepo --monorepo${c.reset}
  ${c.dim}npm run create-app:e2e -- --skeleton react${c.reset}
  ${c.dim}npm run create-app:e2e -- --skeleton react --output ./my-apps/custom-name${c.reset}
`);
}

/**
 * Find a test-helper function call block (e.g., testMeteorSkeleton({ skeletonName: 'react', ... }))
 * that contains a matching name key/value, and return the content of its options object.
 */
function findTestHelperBlock(content, fnName, nameKey, nameValue) {
  let searchStart = 0;

  while (searchStart < content.length) {
    const fnIdx = content.indexOf(fnName + '(', searchStart);
    if (fnIdx === -1) return null;

    const braceIdx = content.indexOf('{', fnIdx + fnName.length);
    if (braceIdx === -1) return null;

    // Find matching closing brace
    let depth = 0;
    let endIdx = -1;
    for (let i = braceIdx; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx !== -1) {
      const block = content.substring(braceIdx, endIdx + 1);
      const namePattern = new RegExp(`${nameKey}:\\s*['"]${nameValue}['"]`);
      if (namePattern.test(block)) {
        return block;
      }
    }

    searchStart = endIdx !== -1 ? endIdx + 1 : fnIdx + 1;
  }

  return null;
}

/**
 * Parse environment variable patterns from a code string.
 * Matches:
 *   - process.env.KEY = 'value'  (non-empty string values only)
 *   - env: { KEY: 'value', ... }
 * Only includes envs that have an actual non-empty value.
 */
function parseEnvVars(code) {
  const envVars = {};

  // Pattern 1: process.env.KEY = 'value' or "value" (non-empty values only)
  const processEnvRegex = /process\.env\.(\w+)\s*=\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = processEnvRegex.exec(code)) !== null) {
    envVars[match[1]] = match[2];
  }

  // Pattern 2: env: { KEY: 'value', ... }
  const envObjRegex = /\benv:\s*\{([^}]+)\}/g;
  while ((match = envObjRegex.exec(code)) !== null) {
    const envContent = match[1];
    const kvRegex = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
    let kvMatch;
    while ((kvMatch = kvRegex.exec(envContent)) !== null) {
      envVars[kvMatch[1]] = kvMatch[2];
    }
  }

  return envVars;
}

/**
 * Read the corresponding test file for an app or skeleton and extract
 * environment variables that the tests set (so the manually created app
 * behaves the same way).
 *
 * For --app <name>:  reads tools/e2e-tests/<name>.test.js (whole file)
 * For --skeleton <name>: reads tools/e2e-tests/skeleton.test.js and
 *   scopes to the testMeteorSkeleton({ skeletonName: '<name>' }) block.
 */
function extractEnvVarsFromTestFile(sourceName, isApp) {
  const testFile = isApp
    ? path.join(E2E_TESTS_DIR, `${sourceName}.test.js`)
    : path.join(E2E_TESTS_DIR, 'skeleton.test.js');

  if (!fs.existsSync(testFile)) return {};

  const content = fs.readFileSync(testFile, 'utf8');
  let scope;

  if (isApp) {
    scope = content;
  } else {
    scope = findTestHelperBlock(content, 'testMeteorSkeleton', 'skeletonName', sourceName);
    if (!scope) return {};
  }

  return parseEnvVars(scope);
}

/**
 * Build a shell env prefix string from an env vars object.
 * e.g., { METEOR_LOCAL_DIR: '.meteor/local-custom' } => "METEOR_LOCAL_DIR=.meteor/local-custom"
 */
function buildEnvPrefix(envVars) {
  const entries = Object.entries(envVars);
  if (entries.length === 0) return '';
  return entries.map(([key, value]) => `${key}=${value}`).join(' ');
}

/**
 * Replace bare `meteor` command occurrences in a script string with the full
 * checkout path. Matches `meteor` only as a standalone command word:
 *   - not preceded by `/` or a word character (avoids already-resolved paths
 *     and things like `something-meteor`)
 *   - not followed by a word character (avoids `meteor-node-stubs` etc.)
 */
function rewriteMeteorCmd(scriptValue, meteorExecutable) {
  return scriptValue.replace(/(?<![/\w])meteor(?![\w-])/g, meteorExecutable);
}

/**
 * Read the package.json at the given path, rewrite all existing scripts to use
 * the checkout meteor binary, inject additional scripts (prefixed with any
 * environment variables extracted from the corresponding test file), and write
 * it back.
 */
async function injectNpmScripts(packageJsonPath, envVars = {}) {
  const pkg = await fs.readJson(packageJsonPath);
  const meteorConfig = pkg.meteor || {};
  const hasTestModule = !!meteorConfig.testModule;
  const hasClient = !!(meteorConfig.mainModule && meteorConfig.mainModule.client);
  const m = METEOR_EXECUTABLE;
  const envPrefix = buildEnvPrefix(envVars);
  const p = envPrefix ? `${envPrefix} ` : '';

  // Rewrite ALL existing scripts: replace bare `meteor` with the checkout path
  const scripts = {};
  for (const [key, value] of Object.entries(pkg.scripts || {})) {
    scripts[key] = `${p}${rewriteMeteorCmd(value, m)}`;
  }

  // Add/overwrite canonical scripts using the checkout path
  scripts['start'] = `${p}${m} run`;
  scripts['start:prod'] = `${p}${m} run --production`;
  scripts['build'] = `${p}${m} build ./_build --directory`;
  scripts['visualize'] = `${p}${m} run --production --extra-packages bundle-visualizer`;
  scripts['reset'] = `${p}${m} reset`;

  if (hasTestModule) {
    scripts['test'] = `${p}${m} test --once --driver-package meteortesting:mocha`;
    scripts['test:watch'] = `${p}${m} test --driver-package meteortesting:mocha`;

    if (hasClient) {
      scripts['test:full-app'] = `${p}${m} test --full-app --once --driver-package meteortesting:mocha`;
      scripts['test:full-app:watch'] = `${p}TEST_WATCH=1 ${m} test --full-app --driver-package meteortesting:mocha`;
    }
  }

  pkg.scripts = scripts;
  pkg.meteor = { ...meteorConfig, modern: { verbose: true } };
  await fs.writeJson(packageJsonPath, pkg, { spaces: 2 });
}

/**
 * Print a summary of all commands available for the created app.
 */
function printCommandSummary(destDir, appPackageJsonPath) {
  const pkg = fs.readJsonSync(appPackageJsonPath, { throws: false }) || {};
  const meteorConfig = pkg.meteor || {};
  const hasTestModule = !!meteorConfig.testModule;
  const hasClient = !!(meteorConfig.mainModule && meteorConfig.mainModule.client);
  const m = METEOR_EXECUTABLE;
  const scripts = pkg.scripts || {};

  // Longest invocation string, for alignment
  const names = Object.keys(scripts);
  const maxLen = names.reduce((max, n) => {
    const inv = n === 'start' ? 'npm start' : `npm run ${n}`;
    return Math.max(max, inv.length);
  }, 0);

  const line = `${c.dim}${'─'.repeat(55)}${c.reset}`;

  console.log('');
  console.log(line);
  console.log(`  ${c.green}${c.bold}App ready at:${c.reset} ${c.cyan}${destDir}${c.reset}`);
  console.log(line);
  console.log('');
  console.log(`  ${c.yellow}cd ${destDir}${c.reset}`);
  console.log('');
  console.log(`  ${c.bold}Run commands${c.reset} ${c.dim}(meteor checkout binary):${c.reset}`);
  console.log(`    ${c.dim}${m} run${c.reset}`);
  console.log(`    ${c.dim}${m} run --production${c.reset}`);

  if (hasTestModule) {
    console.log(`    ${c.dim}${m} test --driver-package meteortesting:mocha${c.reset}`);
    console.log(`    ${c.dim}${m} test --once --driver-package meteortesting:mocha${c.reset}`);
    if (hasClient) {
      console.log(`    ${c.dim}${m} test --full-app --driver-package meteortesting:mocha${c.reset}`);
      console.log(`    ${c.dim}${m} test --full-app --once --driver-package meteortesting:mocha${c.reset}`);
    }
  }

  console.log(`    ${c.dim}${m} build ./_build --directory${c.reset}`);
  console.log('');
  console.log(`  ${c.bold}npm scripts${c.reset} ${c.dim}(run from the app directory):${c.reset}`);

  for (const [name, cmd] of Object.entries(scripts)) {
    const invocation = name === 'start' ? 'npm start' : `npm run ${name}`;
    const padding = ' '.repeat(maxLen - invocation.length);
    console.log(`    ${c.cyan}${invocation}${c.reset}${padding}  ${c.dim}# ${cmd}${c.reset}`);
  }

  console.log(line);
  console.log('');
}

async function setupFromApp(appName, destDir, { isMonorepo = false, force = false } = {}) {
  const sourceDir = path.join(APPS_DIR, appName);

  if (!fs.existsSync(sourceDir)) {
    const available = fs.readdirSync(APPS_DIR).join(', ');
    throw new Error(
      `App '${appName}' not found in tools/e2e-tests/apps/\nAvailable apps: ${available}`
    );
  }

  if (fs.existsSync(destDir)) {
    if (force) {
      log.warn(`Removing existing destination: ${c.cyan}${destDir}${c.reset}`);
      await fs.remove(destDir);
    } else {
      log.error(`Destination already exists: ${c.cyan}${destDir}${c.reset}`);
      log.detail('Remove it first or use --force to replace it.');
      process.exit(1);
    }
  }

  await fs.ensureDir(path.dirname(destDir));

  log.step(`Copying app ${c.bold}${appName}${c.reset} to ${c.cyan}${destDir}${c.reset}`);
  await fs.copy(sourceDir, destDir, {
    dereference: true,
    preserveTimestamps: true,
    overwrite: true,
  });
  log.success('Copy complete.');

  const appPackageJsonPath = isMonorepo
    ? path.join(destDir, 'app', 'package.json')
    : path.join(destDir, 'package.json');

  const envVars = extractEnvVarsFromTestFile(appName, true);
  if (Object.keys(envVars).length > 0) {
    log.detail(`env from test file: ${c.magenta}${Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join(' ')}${c.reset}`);
  }

  const meteorAppDir = isMonorepo ? path.join(destDir, 'app') : destDir;
  const execEnv = Object.keys(envVars).length > 0 ? { env: { ...process.env, ...envVars } } : {};

  log.step('Adding rspack package...');
  await execa(METEOR_EXECUTABLE, ['add', 'rspack'], {
    cwd: meteorAppDir,
    stdio: 'inherit',
    ...execEnv,
  });

  log.step('Linking local @meteorjs/rspack...');
  await linkLocalRspack(meteorAppDir, { env: envVars });

  if (isMonorepo) {
    log.step('Running meteor npm install at root level...');
    await execa(METEOR_EXECUTABLE, ['npm', 'install'], { cwd: destDir, stdio: 'inherit', ...execEnv });
    log.step('Running meteor npm install at app level...');
    await execa(METEOR_EXECUTABLE, ['npm', 'install'], {
      cwd: path.join(destDir, 'app'),
      stdio: 'inherit',
      ...execEnv,
    });
  } else {
    log.step('Running meteor npm install...');
    await execa(METEOR_EXECUTABLE, ['npm', 'install'], { cwd: destDir, stdio: 'inherit', ...execEnv });
  }

  if (fs.existsSync(appPackageJsonPath)) {
    log.step('Injecting npm scripts into package.json...');
    await injectNpmScripts(appPackageJsonPath, envVars);
  }

  return { destDir, appPackageJsonPath };
}

async function setupFromSkeleton(skeletonName, destDir, { force = false } = {}) {
  if (fs.existsSync(destDir)) {
    if (force) {
      log.warn(`Removing existing destination: ${c.cyan}${destDir}${c.reset}`);
      await fs.remove(destDir);
    } else {
      log.error(`Destination already exists: ${c.cyan}${destDir}${c.reset}`);
      log.detail('Remove it first or use --force to replace it.');
      process.exit(1);
    }
  }

  const parentDir = path.dirname(destDir);
  const appDirName = path.basename(destDir);

  await fs.ensureDir(parentDir);

  log.step(`Creating Meteor app ${c.bold}${appDirName}${c.reset} via ${c.dim}meteor create --${skeletonName}${c.reset}`);
  await execa(METEOR_EXECUTABLE, ['create', `--${skeletonName}`, appDirName], {
    cwd: parentDir,
    stdio: 'inherit',
  });

  const appPackageJsonPath = path.join(destDir, 'package.json');

  const envVars = extractEnvVarsFromTestFile(skeletonName, false);
  if (Object.keys(envVars).length > 0) {
    log.detail(`env from test file: ${c.magenta}${Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join(' ')}${c.reset}`);
  }
  const execEnv = Object.keys(envVars).length > 0 ? { env: { ...process.env, ...envVars } } : {};

  log.step('Adding rspack package...');
  await execa(METEOR_EXECUTABLE, ['add', 'rspack'], {
    cwd: destDir,
    stdio: 'inherit',
    ...execEnv,
  });

  log.step('Linking local @meteorjs/rspack...');
  await linkLocalRspack(destDir, { env: envVars });

  log.step('Running meteor npm install...');
  await execa(METEOR_EXECUTABLE, ['npm', 'install'], { cwd: destDir, stdio: 'inherit', ...execEnv });

  if (fs.existsSync(appPackageJsonPath)) {
    log.step('Injecting npm scripts into package.json...');
    await injectNpmScripts(appPackageJsonPath, envVars);
  }

  return { destDir, appPackageJsonPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.app && !args.skeleton) {
    log.error('You must provide --app <name> or --skeleton <name>');
    printHelp();
    process.exit(1);
  }

  if (args.app && args.skeleton) {
    log.error('--app and --skeleton are mutually exclusive');
    process.exit(1);
  }

  const sourceName = args.app || args.skeleton;

  // --output is the full destination path; if omitted, default to ./dist/<sourceName>
  const destDir = args.output
    ? path.resolve(REPO_ROOT, args.output)
    : path.join(DEFAULT_OUTPUT_DIR, sourceName);

  let result;
  if (args.app) {
    result = await setupFromApp(args.app, destDir, { isMonorepo: args.monorepo, force: args.force });
  } else {
    result = await setupFromSkeleton(args.skeleton, destDir, { force: args.force });
  }

  printCommandSummary(result.destDir, result.appPackageJsonPath);
}

main().catch(err => {
  log.error(err.message);
  process.exit(1);
});

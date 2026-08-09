const fs = require('node:fs');
const path = require('node:path');

const {
  withMeteorRstestContext,
} = require('./config/context.js');
const {
  createGeneratedProjects,
} = require('./config/projects.js');
const { assertPureSource } = require('./config/projects.js');

const GENERATED_PROJECT_NAMES = new Set([
  'meteor-pure-server',
  'meteor-pure-client',
  'meteor-browser',
  'meteor-runtime-server',
  'meteor-runtime-client',
  'meteor-e2e',
]);

const SHARED_PROJECT_FIELDS = [
  'setupFiles',
  'env',
  'globals',
  'retry',
  'testTimeout',
  'hookTimeout',
  'maxConcurrency',
  'clearMocks',
  'resetMocks',
  'restoreMocks',
  'unstubEnvs',
  'unstubGlobals',
  'expect',
  'snapshotFormat',
  'resolveSnapshotPath',
  'silent',
  'disableConsoleIntercept',
  'printConsoleTrace',
  'includeTaskLocation',
];

function configError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

async function loadUserConfig({ context, configPath }) {
  if (!configPath) return {};
  const { loadConfig } = await import('@rstest/core');
  const loaded = await withMeteorRstestContext(context, () => loadConfig({
    cwd: context.configRoot,
    path: configPath,
  }));
  return loaded.content || {};
}

async function createPureProject(project, context, sharedConfig) {
  const { toRstestConfig } = await import('@rstest/adapter-rspack');
  const { createTestRspackConfig } = require('@meteorjs/rspack/config.js');
  const isBrowser = project.name === 'meteor-browser';
  const isClient = project.name === 'meteor-pure-client' || isBrowser;
  const aliases = sharedConfig.resolve && sharedConfig.resolve.alias || {};
  if (!aliases || Array.isArray(aliases) || typeof aliases !== 'object') {
    throw configError(
      'METEOR_RSTEST_INVALID_ALIAS',
      'resolve.alias must be an object so Meteor can validate pure-project imports.'
    );
  }
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
        assertPureSource({
          filePath,
          source: fs.readFileSync(filePath, 'utf8'),
          aliases,
        });
      }
    }
  };
  visit(project.root);
  const projection = createTestRspackConfig({
    root: context.appRoot,
    target: isClient ? 'web' : 'node',
    typescript: true,
    jsx: true,
    aliases,
    resolve: sharedConfig.resolve,
    allowedMeteorRequests: Object.keys(aliases),
  });
  const adapted = toRstestConfig({
    rspackConfig: projection,
    configName: project.name,
    cwd: context.appRoot,
  });
  const adapterRspack = adapted.tools.rspack;
  const userRspack = sharedConfig.tools && sharedConfig.tools.rspack;
  const mergeRspackConfig = (base, extra = {}) => ({
    ...base,
    ...extra,
    module: base.module || extra.module ? {
      ...base.module,
      ...extra.module,
      rules: [...base.module?.rules || [], ...extra.module?.rules || []],
    } : undefined,
    resolve: base.resolve || extra.resolve ? {
      ...base.resolve,
      ...extra.resolve,
      alias: { ...base.resolve?.alias, ...extra.resolve?.alias },
      fallback: { ...base.resolve?.fallback, ...extra.resolve?.fallback },
    } : undefined,
    plugins: [...base.plugins || [], ...extra.plugins || []],
    externals: [...new Set([
      ...[].concat(base.externals || []),
      ...[].concat(extra.externals || []),
    ])],
  });
  const enforceProjection = config => mergeRspackConfig(config || {}, {
    resolve: projection.resolve,
    externals: projection.externals,
  });
  const rspackTool = (config, utilities) => {
    const projected = enforceProjection(adapterRspack(config, utilities));
    if (!userRspack) return projected;
    const userResult = typeof userRspack === 'function'
      ? userRspack(projected, utilities)
      : mergeRspackConfig(projected, userRspack);
    if (userResult && typeof userResult.then === 'function') {
      return userResult.then(result => enforceProjection(result || projected));
    }
    return enforceProjection(userResult || projected);
  };
  const sharedProjectConfig = Object.fromEntries(
    SHARED_PROJECT_FIELDS
      .filter(field => sharedConfig[field] !== undefined)
      .map(field => [field, sharedConfig[field]])
  );
  const finalized = {
    ...adapted,
    ...sharedProjectConfig,
    name: project.name,
    root: project.root,
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    testEnvironment: isClient ? 'jsdom' : 'node',
    tools: {
      ...sharedConfig.tools,
      ...adapted.tools,
      rspack: rspackTool,
    },
  };
  if (isBrowser) {
    delete finalized.testEnvironment;
    finalized.browser = {
      provider: 'playwright',
      browser: 'chromium',
      headless: context.once || Boolean(process.env.CI),
      ...sharedConfig.browser,
      enabled: true,
    };
  }
  return finalized;
}

function assertProjectNames(projects) {
  const seen = new Set();
  for (const project of projects) {
    if (typeof project === 'string') continue;
    if (!project || !project.name) continue;
    if (seen.has(project.name)) {
      throw configError(
        'METEOR_RSTEST_PROJECT_COLLISION',
        `Project name "${project.name}" is declared more than once.`
      );
    }
    seen.add(project.name);
  }
}

function generatedProjectMatchesSides(project, context) {
  if (project.name === 'meteor-pure-server') return context.server;
  if (project.name === 'meteor-pure-client' || project.name === 'meteor-browser') {
    return context.client;
  }
  return true;
}

function pathContains(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function finalizeRstestConfig({ context, userConfig = {}, inlineConfig = {} }) {
  const { mergeRstestConfig } = await import('@rstest/core');
  const merged = mergeRstestConfig(userConfig, inlineConfig);
  const userProjects = Array.from(merged.projects || []);
  const stringProject = userProjects.find(project => typeof project === 'string');
  if (stringProject) {
    throw configError(
      'METEOR_RSTEST_STRING_PROJECT_UNSUPPORTED',
      `String/glob project ${JSON.stringify(stringProject)} cannot be ownership-validated. ` +
      'Load it as an object project with a unique name.'
    );
  }
  if (merged.root && path.resolve(merged.root) !== path.resolve(context.appRoot)) {
    throw configError(
      'METEOR_RSTEST_ROOT_CONFLICT',
      `Config root ${JSON.stringify(merged.root)} conflicts with Meteor app root ${JSON.stringify(context.appRoot)}.`
    );
  }
  const userProjectNames = new Set(
    userProjects.filter(project => project && typeof project !== 'string').map(project => project.name)
  );

  for (const name of userProjectNames) {
    if (GENERATED_PROJECT_NAMES.has(name)) {
      throw configError(
        'METEOR_RSTEST_PROTECTED_PROJECT',
        `Project name "${name}" is Meteor-owned. Configure it through the matching tests/rstest root.`
      );
    }
  }

  const plan = createGeneratedProjects({ appRoot: context.appRoot });
  const meteorOwnedRoots = plan.map(project => project.root);
  for (const project of userProjects) {
    if (!project) continue;
    const projectRoot = path.resolve(context.appRoot, project.root || context.appRoot);
    const ownedRoot = meteorOwnedRoots.find(root =>
      pathContains(root, projectRoot) || pathContains(projectRoot, root)
    );
    if (ownedRoot) {
      throw configError(
        'METEOR_RSTEST_PROJECT_ROOT_CONFLICT',
        `Project "${project.name || '<unnamed>'}" root ${JSON.stringify(projectRoot)} overlaps ` +
        `Meteor-owned root ${JSON.stringify(ownedRoot)}. Configure an explicit disjoint root.`
      );
    }
  }
  const generated = [];
  for (const project of plan) {
    if (context.packageTests) continue;
    if (project.meteor.compiler !== 'rstest') continue;
    if (context.phase === 'native' && project.name === 'meteor-e2e') continue;
    if (context.phase === 'external' && project.name !== 'meteor-e2e') continue;
    if (!generatedProjectMatchesSides(project, context)) continue;
    if (!fs.existsSync(project.root)) continue;
    generated.push(await createPureProject(project, context, merged));
  }

  const projects = context.packageTests ? [] : [...generated, ...userProjects];
  assertProjectNames(projects);

  return {
    ...merged,
    ...(merged.reporters === undefined && context.verbose && {
      reporters: 'verbose',
    }),
    root: context.appRoot,
    projects,
    passWithNoTests: merged.passWithNoTests ?? false,
  };
}

function runtimeSettingsFromConfig(config) {
  const normalize = (value, fallback, field) => {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value <= 0 || value > 3600000) {
      throw configError(
        'METEOR_RSTEST_INVALID_TIMEOUT',
        `${field} must be an integer between 1 and 3600000 milliseconds.`
      );
    }
    return value;
  };
  return {
    testTimeout: normalize(config.testTimeout, 30000, 'testTimeout'),
    hookTimeout: normalize(config.hookTimeout, 10000, 'hookTimeout'),
  };
}

async function runMeteorRstest({
  context,
  configPath,
  inlineConfig,
  files,
  testNamePattern,
}) {
  const userConfig = await loadUserConfig({ context, configPath });
  const config = await finalizeRstestConfig({
    context,
    userConfig,
    inlineConfig,
  });
  const { runRstest } = await import('@rstest/core/api');
  return runRstest({
    cwd: context.appRoot,
    inlineConfig: config,
    files,
    testNamePattern,
  });
}

module.exports = {
  finalizeRstestConfig,
  loadUserConfig,
  runtimeSettingsFromConfig,
  runMeteorRstest,
};

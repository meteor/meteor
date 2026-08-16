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
  if (project.include) {
    for (const relativeFile of project.include) {
      const filePath = path.resolve(project.root, relativeFile);
      assertPureSource({
        filePath,
        source: fs.readFileSync(filePath, 'utf8'),
        aliases,
      });
    }
  } else {
    visit(project.root);
  }
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
    include: project.include || ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
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

  const plan = createGeneratedProjects({
    appRoot: context.appRoot,
    routingManifest: context.routingManifest,
  });
  let finalizedUserProjects = userProjects;
  if (context.routingManifest) {
    const meteorOwnedFiles = plan.flatMap(project =>
      (project.include || []).map(file => path.resolve(project.root, file))
    );
    finalizedUserProjects = userProjects.map(project => {
      if (!project) return project;
      const projectRoot = path.resolve(
        context.appRoot,
        project.root || context.appRoot,
      );
      const excludes = meteorOwnedFiles
        .filter(file => pathContains(projectRoot, file))
        .map(file => path.relative(projectRoot, file).split(path.sep).join('/'));
      return excludes.length > 0 ? {
        ...project,
        exclude: [...new Set([...project.exclude || [], ...excludes])],
      } : project;
    });
  } else {
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

  const projects = context.packageTests
    ? []
    : [...generated, ...finalizedUserProjects];
  assertProjectNames(projects);

  const usesTopLevelProject = Boolean(
    context.routingManifest &&
    !context.packageTests &&
    generated.length === 0 &&
    userProjects.length === 0
  );
  const topLevelOwnedFiles = usesTopLevelProject
    ? plan.flatMap(project => project.include || [])
    : [];

  return {
    ...merged,
    ...(merged.reporters === undefined && context.verbose && {
      reporters: 'verbose',
    }),
    root: context.appRoot,
    ...(usesTopLevelProject ? {
      exclude: [...new Set([
        ...merged.exclude || [],
        ...topLevelOwnedFiles,
      ])],
    } : { projects }),
    passWithNoTests: merged.passWithNoTests ?? false,
  };
}

function runtimeSettingsFromConfig(config, { coverage } = {}) {
  const normalizeTimeout = (value, fallback, field) => {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value <= 0 || value > 3600000) {
      throw configError(
        'METEOR_RSTEST_INVALID_TIMEOUT',
        `${field} must be an integer between 1 and 3600000 milliseconds.`
      );
    }
    return value;
  };
  const normalizeMaxConcurrency = value => {
    if (value === undefined) return 5;
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw configError(
        'METEOR_RSTEST_INVALID_MAX_CONCURRENCY',
        'maxConcurrency must be a positive integer.'
      );
    }
    return value;
  };
  const normalizeRetry = value => {
    if (value === undefined) return 0;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw configError(
        'METEOR_RSTEST_INVALID_RETRY',
        'retry must be a non-negative integer.'
      );
    }
    return value;
  };
  const normalizeBoolean = (field, fallback) => {
    const value = config[field];
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') {
      throw configError(
        'METEOR_RSTEST_INVALID_RUNTIME_CONFIG',
        `${field} must be a boolean for Meteor-runtime tests.`
      );
    }
    return value;
  };
  const cloneJsonValue = (field, fallback) => {
    const value = config[field];
    if (value === undefined) return fallback;
    const seen = new Set();
    const validate = current => {
      if (current === null || typeof current === 'string' ||
          typeof current === 'boolean') return;
      if (typeof current === 'number' && Number.isFinite(current)) return;
      if (typeof current !== 'object') {
        throw new TypeError();
      }
      if (seen.has(current)) throw new TypeError();
      seen.add(current);
      if (Array.isArray(current)) {
        current.forEach(validate);
      } else {
        const prototype = Object.getPrototypeOf(current);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError();
        }
        Object.values(current).forEach(validate);
      }
      seen.delete(current);
    };
    try {
      validate(value);
      return JSON.parse(JSON.stringify(value));
    } catch {
      throw configError(
        'METEOR_RSTEST_RUNTIME_CONFIG_NOT_SERIALIZABLE',
        `${field} must contain only JSON-serializable values for Meteor-runtime tests.`
      );
    }
  };
  const normalizeSetupFiles = value => {
    if (value === undefined) return [];
    const entries = Array.isArray(value) ? value : [value];
    const root = path.resolve(config.root || process.cwd());
    return entries.map(entry => {
      if (typeof entry !== 'string' || entry.length === 0) {
        throw configError(
          'METEOR_RSTEST_INVALID_SETUP_FILE',
          'setupFiles must contain non-empty module paths.'
        );
      }
      const formatted = entry.replaceAll('<rootDir>', root);
      const candidate = path.isAbsolute(formatted)
        ? formatted
        : path.resolve(root, formatted);
      if (fs.existsSync(candidate)) return candidate;
      try {
        return require.resolve(formatted, { paths: [root] });
      } catch {
        throw configError(
          'METEOR_RSTEST_SETUP_FILE_NOT_FOUND',
          `Setup file ${JSON.stringify(entry)} cannot be resolved from ${JSON.stringify(root)}.`
        );
      }
    });
  };
  return {
    testTimeout: normalizeTimeout(config.testTimeout, 30000, 'testTimeout'),
    hookTimeout: normalizeTimeout(config.hookTimeout, 10000, 'hookTimeout'),
    maxConcurrency: normalizeMaxConcurrency(config.maxConcurrency),
    retry: normalizeRetry(config.retry),
    globals: normalizeBoolean('globals', false),
    clearMocks: normalizeBoolean('clearMocks', false),
    resetMocks: normalizeBoolean('resetMocks', false),
    restoreMocks: normalizeBoolean('restoreMocks', false),
    unstubEnvs: normalizeBoolean('unstubEnvs', false),
    unstubGlobals: normalizeBoolean('unstubGlobals', false),
    expect: cloneJsonValue('expect', {}),
    snapshotFormat: cloneJsonValue('snapshotFormat', {}),
    env: cloneJsonValue('env', {}),
    silent: normalizeBoolean('silent', false),
    disableConsoleIntercept: normalizeBoolean('disableConsoleIntercept', true),
    printConsoleTrace: normalizeBoolean('printConsoleTrace', false),
    includeTaskLocation: normalizeBoolean('includeTaskLocation', false),
    setupFiles: normalizeSetupFiles(config.setupFiles),
    ...(coverage && { coverage }),
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

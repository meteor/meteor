const fs = require('node:fs');
const path = require('node:path');

const ROOTS = [
  ['meteor-pure-server', 'pure/server', 'rstest', 'node'],
  ['meteor-pure-client', 'pure/client', 'rstest', 'jsdom'],
  ['meteor-browser', 'browser', 'rstest', 'browser'],
  ['meteor-runtime-server', 'runtime/server', 'meteor', 'node'],
  ['meteor-runtime-client', 'runtime/client', 'meteor', 'meteor-client'],
  ['meteor-e2e', 'e2e', 'rstest', 'node'],
];

const ROUTED_ROOTS = [
  ['meteor-pure-server', 'nativeNodeFiles', 'rstest', 'node'],
  ['meteor-pure-client', 'nativeDomFiles', 'rstest', 'jsdom'],
  ['meteor-browser', 'browserFiles', 'rstest', 'browser'],
  ['meteor-runtime-server', 'runtimeServerFiles', 'meteor', 'node'],
  ['meteor-runtime-client', 'runtimeClientFiles', 'meteor', 'meteor-client'],
  ['meteor-e2e', 'externalFiles', 'rstest', 'node'],
];

function routingError(message) {
  const error = new Error(`[Meteor Rstest] Invalid routing manifest: ${message}`);
  error.code = 'METEOR_RSTEST_INVALID_ROUTING_MANIFEST';
  return error;
}

function appRelativeFile(file, appRoot) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) {
    throw routingError('test files must be absolute paths');
  }
  const relative = path.relative(appRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw routingError(`${file} is outside Meteor app root`);
  }
  return relative.split(path.sep).join('/');
}

function readRoutingManifest(routingManifest, appRoot) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(routingManifest, 'utf8'));
  } catch {
    throw routingError(`cannot read ${routingManifest}`);
  }
  if (!parsed || parsed.schemaVersion !== 1 || ROUTED_ROOTS.some(
    ([, field]) => !Array.isArray(parsed[field])
  )) {
    throw routingError('expected schemaVersion 1 and all routing arrays');
  }
  return parsed;
}

function createGeneratedProjects({ appRoot, routingManifest = null }) {
  if (routingManifest) {
    const routing = readRoutingManifest(routingManifest, appRoot);
    return ROUTED_ROOTS.flatMap(([name, field, compiler, environment]) => {
      const include = [...new Set(routing[field].map(file =>
        appRelativeFile(file, appRoot)
      ))].sort();
      return include.length > 0 ? [{
        name,
        root: appRoot,
        include,
        test: { environment },
        meteor: { compiler },
      }] : [];
    });
  }
  return ROOTS.map(([name, root, compiler, environment]) => ({
    name,
    root: path.join(appRoot, 'tests', 'rstest', root),
    test: { environment },
    meteor: { compiler },
  }));
}

function classifyTestFile(filePath, appRoot) {
  const relative = path.relative(appRoot, filePath).split(path.sep).join('/');
  const roots = [
    ['tests/rstest/pure/server/', 'pure-server', 'rstest'],
    ['tests/rstest/pure/client/', 'pure-client', 'rstest'],
    ['tests/rstest/browser/', 'browser', 'rstest'],
    ['tests/rstest/runtime/server/', 'runtime-server', 'meteor'],
    ['tests/rstest/runtime/client/', 'runtime-client', 'meteor'],
    ['tests/rstest/e2e/', 'e2e', 'rstest'],
    ['tests/legacy/', 'legacy', 'legacy'],
  ];
  const match = roots.find(([root]) => relative.startsWith(root));
  if (!match) {
    return { owner: 'compatibility', compiler: 'meteor', relative };
  }
  return { owner: match[1], compiler: match[2], relative };
}

function directMeteorRequests(source) {
  const requests = new Set();
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const pattern = /^\s*(?!\/\/)(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?['"](meteor\/[^'"]+)['"]/gm;
  let match;
  while ((match = pattern.exec(withoutBlockComments))) {
    requests.add(match[1]);
  }
  return [...requests];
}

function assertPureSource({ filePath, source, aliases = {} }) {
  const request = directMeteorRequests(source).find(id => !aliases[id]);
  if (!request) return;

  const side = filePath.split(path.sep).includes('client') ? 'client' : 'server';
  const error = new Error(
    `[Meteor Rstest] ${filePath} imports ${request}, which requires Meteor runtime. ` +
    `Move file to tests/rstest/runtime/${side} or configure an explicit pure alias/mock.`
  );
  error.code = 'RSTEST_RUNTIME_PROJECT_REQUIRED';
  throw error;
}

module.exports = {
  assertPureSource,
  classifyTestFile,
  createGeneratedProjects,
  directMeteorRequests,
  readRoutingManifest,
};

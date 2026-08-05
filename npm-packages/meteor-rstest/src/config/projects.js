const path = require('node:path');

const ROOTS = [
  ['meteor-pure-server', 'pure/server', 'rstest', 'node'],
  ['meteor-pure-client', 'pure/client', 'rstest', 'jsdom'],
  ['meteor-browser', 'browser', 'rstest', 'browser'],
  ['meteor-runtime-server', 'runtime/server', 'meteor', 'node'],
  ['meteor-runtime-client', 'runtime/client', 'meteor', 'meteor-client'],
  ['meteor-e2e', 'e2e', 'rstest', 'node'],
];

function createGeneratedProjects({ appRoot }) {
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
};

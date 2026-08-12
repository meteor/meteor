const path = require('node:path');

const {
  analyzeTestEntries,
} = require('@meteorjs/rspack/test-classifier.js');
const { parseRstestFilename } = require('./markers.js');

function routingError(code, file, message) {
  const error = new Error(`[Meteor Rstest] ${file}: ${message}`);
  error.code = code;
  return error;
}

function oldRootHint(file, appRoot) {
  const relative = path.relative(appRoot, file).split(path.sep).join('/');
  if (relative.startsWith('tests/rstest/pure/server/')) {
    return { owned: true, execution: 'native', environment: 'node', architectures: [] };
  }
  if (relative.startsWith('tests/rstest/pure/client/')) {
    return { owned: true, execution: 'native', environment: 'jsdom', architectures: ['client'] };
  }
  if (relative.startsWith('tests/rstest/browser/')) {
    return { owned: true, execution: 'native', environment: 'browser', architectures: ['client'] };
  }
  if (relative.startsWith('tests/rstest/runtime/server/')) {
    return { owned: true, execution: 'meteor-runtime', environment: 'meteor', architectures: ['server'] };
  }
  if (relative.startsWith('tests/rstest/runtime/client/')) {
    return { owned: true, execution: 'meteor-runtime', environment: 'meteor', architectures: ['client'] };
  }
  if (relative.startsWith('tests/rstest/e2e/')) {
    return { owned: true, execution: 'external-e2e', environment: 'node', architectures: [] };
  }
  return null;
}

function signal(requests, name) {
  return requests.some(item => item.request === name || item.request.startsWith(`${name}/`));
}

async function classifyRstestCandidates({
  appRoot,
  candidates,
  server = true,
  client = true,
}) {
  const files = [...new Set(candidates.map(file => path.resolve(file)))].sort();
  const graph = await analyzeTestEntries({ root: appRoot, entries: files });
  const requestsByFile = new Map(graph.map(item => [item.file, item.requests]));
  const manifest = {
    schemaVersion: 1,
    nativeNodeFiles: [],
    nativeDomFiles: [],
    browserFiles: [],
    runtimeServerFiles: [],
    runtimeClientFiles: [],
    externalFiles: [],
    legacyFiles: [],
    files: [],
  };

  for (const file of files) {
    const marker = parseRstestFilename(file);
    if (marker.conflicts.length > 0) {
      throw routingError('RSTEST_ROUTING_CONFLICT', file, marker.conflicts.join('; '));
    }
    const rootHint = oldRootHint(file, appRoot);
    const requests = requestsByFile.get(file) || [];
    const hasCore = signal(requests, '@rstest/core');
    const hasBrowser = signal(requests, '@rstest/browser');
    const hasPlaywright = signal(requests, '@rstest/playwright');
    const hasMeteorApi = signal(requests, 'meteor/rstest');
    const hasMeteor = requests.some(item => /^meteor\//.test(item.request));
    const owned = marker.owned || rootHint || hasCore || hasBrowser ||
      hasPlaywright || hasMeteorApi;
    if (!owned) {
      manifest.legacyFiles.push(file);
      continue;
    }
    if (hasBrowser && hasMeteor) {
      throw routingError(
        'RSTEST_ROUTING_CONFLICT',
        file,
        '@rstest/browser cannot execute real meteor/* runtime imports',
      );
    }
    if (hasPlaywright && hasMeteor) {
      throw routingError(
        'RSTEST_ROUTING_CONFLICT',
        file,
        '@rstest/playwright tests must drive Meteor through its application URL',
      );
    }

    const hint = marker.execution ? marker : rootHint;
    let execution = hint && hint.execution;
    let environment = hint && hint.environment;
    let architectures = hint && hint.architectures || [];
    if (!execution) {
      if (hasPlaywright) {
        execution = 'external-e2e';
        environment = 'node';
      } else if (hasBrowser) {
        execution = 'native';
        environment = 'browser';
        architectures = ['client'];
      } else if (hasMeteor) {
        execution = 'meteor-runtime';
        environment = 'meteor';
      } else {
        execution = 'native';
        environment = 'node';
      }
    }
    if (hasMeteor && execution !== 'meteor-runtime') {
      throw routingError(
        'RSTEST_ROUTING_CONFLICT',
        file,
        `${execution} routing cannot execute real meteor/* runtime imports`,
      );
    }
    if (hasBrowser &&
        (execution !== 'native' || environment !== 'browser')) {
      throw routingError(
        'RSTEST_ROUTING_CONFLICT',
        file,
        '@rstest/browser requires native Browser Mode routing',
      );
    }
    if (hasPlaywright && execution !== 'external-e2e') {
      throw routingError(
        'RSTEST_ROUTING_CONFLICT',
        file,
        '@rstest/playwright requires external E2E routing',
      );
    }
    if (execution === 'meteor-runtime' && architectures.length === 0) {
      architectures = [
        ...(server ? ['server'] : []),
        ...(client ? ['client'] : []),
      ];
    }

    if (execution === 'external-e2e') manifest.externalFiles.push(file);
    else if (execution === 'meteor-runtime') {
      if (architectures.includes('server')) manifest.runtimeServerFiles.push(file);
      if (architectures.includes('client')) manifest.runtimeClientFiles.push(file);
    } else if (environment === 'browser') manifest.browserFiles.push(file);
    else if (environment === 'jsdom') manifest.nativeDomFiles.push(file);
    else manifest.nativeNodeFiles.push(file);
    manifest.files.push({ file, execution, environment, architectures, requests });
  }

  for (const value of Object.values(manifest)) {
    if (Array.isArray(value) && value.every(item => typeof item === 'string')) value.sort();
  }
  return manifest;
}

module.exports = { classifyRstestCandidates };

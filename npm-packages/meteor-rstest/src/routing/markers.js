const path = require('node:path');

const MARKED_TEST_FILE = /^(.*)\.rstest\.(?:test|spec)s?\.(?:[cm]?[jt]sx?)$/i;

function parseRstestFilename(filePath) {
  const match = MARKED_TEST_FILE.exec(path.basename(filePath));
  const empty = {
    owned: false,
    execution: null,
    environment: null,
    architectures: [],
    conflicts: [],
  };
  if (!match) return empty;

  const markers = new Set(match[1].toLowerCase().split('.'));
  const conflict = message => ({
    ...empty,
    owned: true,
    conflicts: [message],
  });
  if (markers.has('server') && markers.has('client')) {
    return conflict('server conflicts with client');
  }
  if (markers.has('browser') && markers.has('meteor')) {
    return conflict('browser conflicts with meteor');
  }
  if (markers.has('e2e') && (
    markers.has('browser') || markers.has('meteor') || markers.has('native') ||
    markers.has('dom')
  )) {
    return conflict('e2e conflicts with another execution marker');
  }

  const result = { ...empty, owned: true };
  if (markers.has('e2e')) {
    result.execution = 'external-e2e';
    result.environment = 'node';
  } else if (markers.has('browser')) {
    result.execution = 'native';
    result.environment = 'browser';
    result.architectures = ['client'];
  } else if (markers.has('meteor')) {
    result.execution = 'meteor-runtime';
    result.environment = 'meteor';
    if (markers.has('server')) result.architectures = ['server'];
    if (markers.has('client')) result.architectures = ['client'];
  } else if (markers.has('dom')) {
    result.execution = 'native';
    result.environment = 'jsdom';
    result.architectures = ['client'];
  } else if (markers.has('native')) {
    result.execution = 'native';
    result.environment = 'node';
  }
  return result;
}

module.exports = { parseRstestFilename };

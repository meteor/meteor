#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const HEAVY_FILES = new Set([
  'bundle',
  'bundle-npm',
  'compiler-plugins',
  'compiler-plugins-features',
  'compiler-plugins-local',
  'cordova-append-config',
  'cordova-builds',
  'cordova-hcp',
  'cordova-platforms',
  'cordova-plugins',
  'modern',
  'modern-build',
  'modern-transpiler',
  'modules',
  'modules-modern',
  'package-tests-changes',
  'package-tests-versions',
]);

function escapeRegex(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function validateTestRecord(record, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`invalid test record at index ${index}`);
  }

  if (typeof record.file !== 'string'
      || record.file.length === 0
      || record.file.length > 255
      || /[\u0000-\u001f\u007f/\\]/u.test(record.file)) {
    throw new Error(`invalid file at index ${index}`);
  }

  if (typeof record.name !== 'string' || !Array.isArray(record.tags)) {
    throw new Error(`invalid test record at index ${index}`);
  }
}

function buildMatrix(tests) {
  if (!Array.isArray(tests) || tests.length === 0) {
    throw new Error('no tests in input');
  }

  const countsByFile = new Map();
  tests.forEach((record, index) => {
    validateTestRecord(record, index);
    countsByFile.set(record.file, (countsByFile.get(record.file) || 0) + 1);
  });

  const padWidth = String(countsByFile.size).length;
  const include = Array.from(countsByFile, ([file, count], index) => {
    const id = String(index + 1).padStart(padWidth, '0');
    return {
      id,
      name: `${file}.js (${count} test${count === 1 ? '' : 's'})`,
      file,
      fileRegex: `^${escapeRegex(file)}$`,
      junit: `${id}.xml`,
      count,
      resources: HEAVY_FILES.has(file) ? 'heavy' : 'default',
    };
  });

  return { include };
}

function main(argv) {
  const inputPath = argv[2];
  if (!inputPath) {
    throw new Error('missing input path argument');
  }

  const tests = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const matrix = buildMatrix(tests);
  process.stdout.write(`${JSON.stringify(matrix)}\n`);
  process.stderr.write(
    `build-test-matrix: ${matrix.include.length} files, ${tests.length} tests\n`,
  );
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    process.stderr.write(`build-test-matrix: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { buildMatrix, escapeRegex };

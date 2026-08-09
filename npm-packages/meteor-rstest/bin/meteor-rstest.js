#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  createMeteorRstestContext,
} = require('../src/config/context.js');

const CONFIG_EXTENSIONS = ['.js', '.ts', '.mjs', '.mts', '.cjs', '.cts'];

function takeValue(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`[Meteor Rstest] ${option} requires a value.`);
  }
  return value;
}

function parseArgs(argv) {
  const parsed = {
    cwd: process.cwd(),
    once: false,
    verbose: false,
    command: 'test',
    configPath: null,
    fullApp: false,
    packageTests: false,
    phase: 'native',
    runtimePlanOutput: null,
    runtimeSettingsOutput: null,
    runtimeSettingsGeneration: null,
    resultOutput: null,
    architectures: [],
    client: true,
    server: true,
    forwarded: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      parsed.forwarded.push(...argv.slice(index + 1));
      break;
    }
    if (arg === '--cwd') {
      parsed.cwd = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--local-dir') {
      parsed.localDir = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--harness-root') {
      parsed.harnessRoot = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--config') {
      parsed.configPath = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--command') {
      parsed.command = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--phase') {
      parsed.phase = takeValue(argv, index, arg);
      if (parsed.phase !== 'native' && parsed.phase !== 'external') {
        throw new Error(`[Meteor Rstest] --phase must be native or external.`);
      }
      index += 1;
    } else if (arg === '--once') {
      parsed.once = true;
    } else if (arg === '--verbose') {
      parsed.verbose = true;
    } else if (arg === '--full-app') {
      parsed.fullApp = true;
    } else if (arg === '--package-tests') {
      parsed.packageTests = true;
      parsed.command = 'test-packages';
    } else if (arg === '--runtime-plan-output') {
      parsed.runtimePlanOutput = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--runtime-settings-output') {
      parsed.runtimeSettingsOutput = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--runtime-settings-generation') {
      parsed.runtimeSettingsGeneration = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--result-output') {
      parsed.resultOutput = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--architecture') {
      parsed.architectures.push(takeValue(argv, index, arg));
      index += 1;
    } else if (arg === '--server-only') {
      parsed.server = true;
      parsed.client = false;
    } else if (arg === '--client-only') {
      parsed.server = false;
      parsed.client = true;
    } else if (arg === '--test-name-pattern') {
      parsed.forwarded.push('--testNamePattern', takeValue(argv, index, arg));
      index += 1;
    } else if (arg === '--test-file') {
      parsed.forwarded.push(takeValue(argv, index, arg));
      index += 1;
    } else {
      parsed.forwarded.push(arg);
    }
  }

  return parsed;
}

function discoverConfig(cwd) {
  for (const extension of CONFIG_EXTENSIONS) {
    const candidate = path.join(cwd, `rstest.config${extension}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function writeGeneratedConfig({
  context,
  configPath,
  runtimeSettingsOutput,
  runtimeSettingsGeneration,
  resultOutput,
}) {
  const stateDir = path.join(context.localDir, 'rstest');
  const generatedPath = path.join(stateDir, 'rstest.generated.config.cjs');
  const factoryPath = path.resolve(__dirname, '../src/generated-config.js');
  const contents = [
    `'use strict';`,
    `const { createGeneratedConfig } = require(${JSON.stringify(factoryPath)});`,
    `module.exports = createGeneratedConfig(${JSON.stringify({
      context,
      configPath,
      runtimeSettingsOutput,
      runtimeSettingsGeneration,
      resultOutput,
    }, null, 2)});`,
    '',
  ].join('\n');

  fs.mkdirSync(stateDir, { recursive: true });
  if (!fs.existsSync(generatedPath) || fs.readFileSync(generatedPath, 'utf8') !== contents) {
    fs.writeFileSync(generatedPath, contents);
  }
  return generatedPath;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(parsed.cwd);
  const localDir = path.resolve(parsed.localDir || path.join(cwd, '.meteor', 'local'));
  const configPath = parsed.configPath
    ? path.resolve(cwd, parsed.configPath)
    : discoverConfig(cwd);
  const context = createMeteorRstestContext({
    appRoot: cwd,
    configRoot: configPath ? path.dirname(configPath) : cwd,
    harnessRoot: path.resolve(parsed.harnessRoot || cwd),
    localDir,
    command: parsed.command,
    once: parsed.once,
    verbose: parsed.verbose,
    fullApp: parsed.fullApp,
    packageTests: parsed.packageTests,
    phase: parsed.phase,
    client: parsed.client,
    server: parsed.server,
    architectures: parsed.architectures.length > 0 ? parsed.architectures : undefined,
  });
  if (parsed.runtimePlanOutput) {
    const {
      finalizeRstestConfig,
      loadUserConfig,
      runtimeSettingsFromConfig,
    } = require('../src/coordinator.js');
    const userConfig = await loadUserConfig({ context, configPath });
    const config = await finalizeRstestConfig({ context, userConfig });
    const outputPath = path.resolve(parsed.runtimePlanOutput);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const output = {
      schemaVersion: 1,
      generation: parsed.runtimeSettingsGeneration,
      ...runtimeSettingsFromConfig(config),
    };
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(output));
    fs.renameSync(temporaryPath, outputPath);
    return;
  }
  const generatedConfig = writeGeneratedConfig({
    context,
    configPath,
    runtimeSettingsOutput: parsed.runtimeSettingsOutput
      ? path.resolve(parsed.runtimeSettingsOutput)
      : null,
    runtimeSettingsGeneration: parsed.runtimeSettingsGeneration,
    resultOutput: parsed.resultOutput ? path.resolve(parsed.resultOutput) : null,
  });

  process.chdir(cwd);
  const { runCLI } = await import('@rstest/core');
  runCLI({
    argv: [
      process.execPath,
      process.argv[1],
      parsed.once ? 'run' : 'watch',
      '--config',
      generatedConfig,
      ...parsed.forwarded,
    ],
  });
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});

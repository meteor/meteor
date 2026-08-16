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
    coveragePlanOutput: null,
    coverageGeneration: null,
    coverageArtifact: null,
    coverageFinalizeManifest: null,
    coverageEnabled: false,
    classifyCandidates: null,
    classificationOutput: null,
    routingManifest: null,
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
    } else if (arg === '--coverage-plan-output') {
      parsed.coveragePlanOutput = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--coverage-generation') {
      parsed.coverageGeneration = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--coverage-artifact') {
      parsed.coverageArtifact = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--coverage-finalize-manifest') {
      parsed.coverageFinalizeManifest = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--coverage') {
      parsed.coverageEnabled = true;
      parsed.forwarded.push(arg);
    } else if (arg === '--classify-candidates') {
      parsed.classifyCandidates = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--classification-output') {
      parsed.classificationOutput = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--routing-manifest') {
      parsed.routingManifest = takeValue(argv, index, arg);
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
  coveragePlanOutput,
  coverageGeneration,
  coverageArtifact,
  cliCoverageEnabled,
  deferNativeReport,
  hasMeteorRuntime,
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
      coveragePlanOutput,
      coverageGeneration,
      coverageArtifact,
      cliCoverageEnabled,
      deferNativeReport,
      hasMeteorRuntime,
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
    routingManifest: parsed.routingManifest
      ? path.resolve(parsed.routingManifest)
      : null,
    architectures: parsed.architectures.length > 0 ? parsed.architectures : undefined,
  });
  if (parsed.coverageFinalizeManifest) {
    const manifestPath = path.resolve(parsed.coverageFinalizeManifest);
    const { readCoverageManifest } = require('../src/coverage/artifact.js');
    const { finalizeCoverage } = require('../src/coverage/finalize.js');
    const { loadUserConfig } = require('../src/coordinator.js');
    const manifest = readCoverageManifest({
      filePath: manifestPath,
      expectedPath: manifestPath,
    });
    const config = await loadUserConfig({ context, configPath });
    const result = await finalizeCoverage({ manifest, config });
    process.exitCode = result.exitCode;
    return;
  }
  if (parsed.classifyCandidates || parsed.classificationOutput) {
    if (!parsed.classifyCandidates || !parsed.classificationOutput) {
      throw new Error(
        '[Meteor Rstest] --classify-candidates and --classification-output must be used together.'
      );
    }
    const candidates = JSON.parse(fs.readFileSync(
      path.resolve(parsed.classifyCandidates),
      'utf8',
    ));
    if (!Array.isArray(candidates) || candidates.some(file => typeof file !== 'string')) {
      throw new Error('[Meteor Rstest] Invalid classification candidate manifest.');
    }
    const { classifyRstestCandidates } = require('../src/routing/classifier.js');
    const manifest = await classifyRstestCandidates({
      appRoot: cwd,
      candidates,
      server: parsed.server,
      client: parsed.client,
    });
    const outputPath = path.resolve(parsed.classificationOutput);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(manifest));
    fs.renameSync(temporaryPath, outputPath);
    return;
  }
  if (parsed.runtimePlanOutput) {
    const {
      finalizeRstestConfig,
      loadUserConfig,
      runtimeSettingsFromConfig,
    } = require('../src/coordinator.js');
    const { coveragePlanFromConfig } = require('../src/coverage/plan.js');
    const userConfig = await loadUserConfig({ context, configPath });
    const config = await finalizeRstestConfig({ context, userConfig });
    const outputPath = path.resolve(parsed.runtimePlanOutput);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const coveragePlan = parsed.coveragePlanOutput || parsed.coverageGeneration || parsed.coverageArtifact || parsed.coverageEnabled
      ? coveragePlanFromConfig(config, {
        cliEnabled: parsed.coverageEnabled,
        generation: parsed.coverageGeneration,
        root: context.appRoot,
        artifactRoot: path.dirname(
          parsed.coverageArtifact || parsed.coveragePlanOutput || path.join(context.localDir, 'rstest', 'coverage', parsed.coverageGeneration || 'native'),
        ),
        hasMeteorRuntime: true,
      })
      : null;
    if (parsed.coveragePlanOutput && coveragePlan.enabled) {
      const coveragePlanOutput = path.resolve(parsed.coveragePlanOutput);
      fs.mkdirSync(path.dirname(coveragePlanOutput), { recursive: true });
      const temporaryCoveragePlan = `${coveragePlanOutput}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryCoveragePlan, JSON.stringify(coveragePlan));
      fs.renameSync(temporaryCoveragePlan, coveragePlanOutput);
    }
    const output = {
      schemaVersion: 1,
      generation: parsed.runtimeSettingsGeneration,
      ...runtimeSettingsFromConfig(config, {
        coverage: coveragePlan && coveragePlan.enabled ? coveragePlan : null,
      }),
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
    coveragePlanOutput: parsed.coveragePlanOutput ? path.resolve(parsed.coveragePlanOutput) : null,
    coverageGeneration: parsed.coverageGeneration,
    coverageArtifact: parsed.coverageArtifact ? path.resolve(parsed.coverageArtifact) : null,
    cliCoverageEnabled: parsed.coverageEnabled,
    deferNativeReport: Boolean(parsed.coverageArtifact),
    hasMeteorRuntime: parsed.phase === 'external' || Boolean(parsed.coverageArtifact),
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

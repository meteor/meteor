const {
  createMeteorRstestContext,
} = require('./config/context.js');
const {
  finalizeRstestConfig,
  loadUserConfig,
  runtimeSettingsFromConfig,
} = require('./coordinator.js');
const {
  coveragePlanFromConfig,
} = require('./coverage/plan.js');
const {
  MeteorCoverageCaptureReporter,
} = require('./coverage/reporter.js');
const fs = require('node:fs');
const path = require('node:path');

function createGeneratedConfig({
  context: contextInput,
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
  return async function meteorGeneratedRstestConfig() {
    const context = createMeteorRstestContext(contextInput);
    const userConfig = await loadUserConfig({ context, configPath });
    const config = await finalizeRstestConfig({ context, userConfig });
    const hasCoveragePlan = Boolean(
      coveragePlanOutput || coverageGeneration || coverageArtifact || cliCoverageEnabled,
    );
    const coveragePlan = hasCoveragePlan
      ? coveragePlanFromConfig(config, {
        cliEnabled: cliCoverageEnabled,
        generation: coverageGeneration,
        root: context.appRoot,
        artifactRoot: path.dirname(
          coverageArtifact || coveragePlanOutput || path.join(context.localDir, 'rstest', 'coverage', coverageGeneration || 'native'),
        ),
        hasMeteorRuntime: Boolean(hasMeteorRuntime || deferNativeReport),
      })
      : null;
    if (coveragePlanOutput && coveragePlan.enabled) {
      fs.mkdirSync(path.dirname(coveragePlanOutput), { recursive: true });
      const temporaryPath = `${coveragePlanOutput}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(coveragePlan));
      fs.renameSync(temporaryPath, coveragePlanOutput);
    }
    if (deferNativeReport && coveragePlan.enabled) {
      config.coverage = {
        ...config.coverage,
        reporters: [],
        thresholds: undefined,
        include: [],
        clean: false,
      };
      const existing = config.reporters == null
        ? ['default']
        : Array.isArray(config.reporters)
          ? config.reporters
          : [config.reporters];
      config.reporters = [...existing, new MeteorCoverageCaptureReporter({
        outputPath: coverageArtifact,
        generation: coveragePlan.generation,
      })];
    }
    if (resultOutput) {
      const existing = config.reporters == null
        ? ['default']
        : Array.isArray(config.reporters)
          ? config.reporters
          : [config.reporters];
      config.reporters = [...existing, ['json', { outputPath: resultOutput }]];
    }
    if (runtimeSettingsOutput) {
      fs.mkdirSync(path.dirname(runtimeSettingsOutput), { recursive: true });
      const temporaryPath = `${runtimeSettingsOutput}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify({
        schemaVersion: 1,
        generation: runtimeSettingsGeneration,
        ...runtimeSettingsFromConfig(config, {
          coverage: coveragePlan && coveragePlan.enabled ? coveragePlan : null,
        }),
      }));
      fs.renameSync(temporaryPath, runtimeSettingsOutput);
    }
    return config;
  };
}

module.exports = { createGeneratedConfig };

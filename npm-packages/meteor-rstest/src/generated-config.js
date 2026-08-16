const {
  createMeteorRstestContext,
} = require('./config/context.js');
const {
  finalizeRstestConfig,
  loadUserConfig,
  runtimeSettingsFromConfig,
} = require('./coordinator.js');
const {
  coveragePolicyFromConfig,
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
  coverageCliArgs,
  coveragePolicy: coveragePolicyInput,
  deferNativeReport,
  hasMeteorRuntime,
}) {
  return async function meteorGeneratedRstestConfig() {
    const context = createMeteorRstestContext(contextInput);
    const userConfig = await loadUserConfig({ context, configPath });
    const config = await finalizeRstestConfig({ context, userConfig });
    const coveragePolicy = coveragePolicyInput || coveragePolicyFromConfig(config, {
      cliEnabled: cliCoverageEnabled,
      cliArgs: coverageCliArgs,
      hasMeteorRuntime: Boolean(hasMeteorRuntime || deferNativeReport),
    });
    const { schemaVersion: _policySchemaVersion, ...effectiveCoverage } =
      coveragePolicy;
    const hasCoveragePlan = Boolean(
      coveragePlanOutput || coverageGeneration || coverageArtifact ||
      cliCoverageEnabled || coveragePolicy.enabled,
    );
    const coveragePlan = hasCoveragePlan
      ? coveragePlanFromConfig({ ...config, coverage: effectiveCoverage }, {
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
        ...effectiveCoverage,
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
    if (context.phase === 'external' && context.fullApp &&
        coveragePlan && coveragePlan.enabled &&
        coveragePlan.provider === 'istanbul') {
      config.coverage = {
        ...effectiveCoverage,
        reporters: [],
        thresholds: undefined,
        clean: false,
      };
      const setupFile = path.resolve(__dirname, 'coverage/playwright-setup.mjs');
      const appendSetupFile = value => {
        const existing = value == null
          ? []
          : Array.isArray(value)
            ? value
            : [value];
        return [...existing.filter(item => item !== setupFile), setupFile];
      };
      config.projects = (config.projects || []).map(project =>
        project && project.name === 'meteor-e2e'
          ? { ...project, setupFiles: appendSetupFile(project.setupFiles) }
          : project
      );
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

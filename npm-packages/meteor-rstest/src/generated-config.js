const {
  createMeteorRstestContext,
} = require('./config/context.js');
const {
  finalizeRstestConfig,
  loadUserConfig,
  runtimeSettingsFromConfig,
} = require('./coordinator.js');
const fs = require('node:fs');
const path = require('node:path');

function createGeneratedConfig({
  context: contextInput,
  configPath,
  runtimeSettingsOutput,
  runtimeSettingsGeneration,
  resultOutput,
}) {
  return async function meteorGeneratedRstestConfig() {
    const context = createMeteorRstestContext(contextInput);
    const userConfig = await loadUserConfig({ context, configPath });
    const config = await finalizeRstestConfig({ context, userConfig });
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
        ...runtimeSettingsFromConfig(config),
      }));
      fs.renameSync(temporaryPath, runtimeSettingsOutput);
    }
    return config;
  };
}

module.exports = { createGeneratedConfig };

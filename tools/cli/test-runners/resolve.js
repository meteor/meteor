const registry = require('./provider-registry.js');

async function resolveTestRunner(options) {
  const selection = await registry.resolveTestRunnerProvider(options);
  if (selection.engine !== 'driver') return selection;
  const { id: _id, ...legacySelection } = selection;
  return legacySelection;
}

module.exports = {
  ...registry,
  resolveTestRunner,
};

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function coveragePlanError() {
  return new Error('[Meteor Rstest] Invalid or stale coverage plan from Meteor CLI.');
}

function isAbsolutePath(value) {
  return typeof value === 'string' && (
    path.isAbsolute(value) || path.win32.isAbsolute(value)
  );
}

function readRstestCoveragePlan(filename, { generation } = {}) {
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    throw coveragePlanError();
  }
  if (!plan || plan.schemaVersion !== 1 ||
      typeof plan.generation !== 'string' || plan.generation.length === 0 ||
      generation !== undefined && plan.generation !== generation ||
      typeof plan.enabled !== 'boolean' ||
      !['istanbul', 'v8'].includes(plan.provider) ||
      !isAbsolutePath(plan.root) ||
      !Array.isArray(plan.include) ||
      plan.include.some(entry => typeof entry !== 'string') ||
      !Array.isArray(plan.exclude) ||
      plan.exclude.some(entry => typeof entry !== 'string') ||
      typeof plan.allowExternal !== 'boolean' ||
      !isAbsolutePath(plan.artifactRoot)) {
    throw coveragePlanError();
  }
  return plan;
}

function resolveRstestCoverageSwcPlugin({ npmRoot }) {
  const appRequire = createRequire(path.join(path.resolve(npmRoot), 'package.json'));
  const coordinatorEntry = appRequire.resolve('@meteorjs/rstest');
  const providerEntry = createRequire(coordinatorEntry).resolve(
    '@rstest/coverage-istanbul',
  );
  return createRequire(providerEntry).resolve('swc-plugin-coverage-instrument');
}

function applyRstestCoverageToSwcRule(rule, { plan, pluginPath }) {
  if (!plan || plan.enabled !== true) return rule;
  if (plan.provider !== 'istanbul') {
    throw new Error(
      '[Meteor Rstest] Meteor-hosted coverage requires the Istanbul provider.',
    );
  }
  if (!Array.isArray(plan.exclude) ||
      plan.exclude.some(entry => typeof entry !== 'string') ||
      !isAbsolutePath(pluginPath)) {
    throw coveragePlanError();
  }

  rule.options = rule.options || {};
  rule.options.jsc = rule.options.jsc || {};
  rule.options.jsc.experimental = rule.options.jsc.experimental || {};
  const plugins = rule.options.jsc.experimental.plugins || [];
  if (!plugins.some(plugin => Array.isArray(plugin) && plugin[0] === pluginPath)) {
    plugins.push([pluginPath, { unstableExclude: [...plan.exclude] }]);
  }
  rule.options.jsc.experimental.plugins = plugins;
  return rule;
}

module.exports = {
  applyRstestCoverageToSwcRule,
  readRstestCoveragePlan,
  resolveRstestCoverageSwcPlugin,
};

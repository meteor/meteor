const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function buildRstestArgs({
  appDir,
  localDir,
  harnessRoot,
  once,
  verbose,
  fullApp,
  server,
  client,
  command,
  config,
  project,
  testFile,
  testNamePattern,
  browser,
  coverage,
  updateSnapshots,
  shard,
  changed,
  changedSince,
  passWithNoTests,
  runtimePlanOutput,
  runtimeSettingsOutput,
  runtimeSettingsGeneration,
  resultOutput,
  architectures,
  phase,
  passthrough,
}) {
  const protectedPassthrough = [].concat(passthrough || []).find(argument =>
    /^(?:--config(?:=|$)|-c(?:=|$)|--root(?:=|$)|--project(?:=|$)|--passWithNoTests(?:=|$))/.test(
      String(argument),
    )
  );
  if (protectedPassthrough) {
    throw new Error(
      `[Meteor Rstest] ${protectedPassthrough} is Meteor-owned and cannot be passed after --. ` +
      'Use the corresponding meteor test option.'
    );
  }
  const args = ['--cwd', appDir, '--local-dir', localDir];
  if (harnessRoot) args.push('--harness-root', harnessRoot);
  if (once) args.push('--once');
  if (verbose) args.push('--verbose');
  if (fullApp) args.push('--full-app');
  if (server && client === false) args.push('--server-only');
  if (client && server === false) args.push('--client-only');
  if (command === 'test-packages') args.push('--package-tests');
  args.push('--command', command);
  if (phase) args.push('--phase', phase);
  if (config) args.push('--config', config);
  for (const name of [].concat(project || [])) args.push('--project', name);
  for (const file of [].concat(testFile || [])) args.push('--test-file', file);
  if (testNamePattern) args.push('--test-name-pattern', testNamePattern);
  if (browser) args.push('--browser.name', browser);
  if (coverage) args.push('--coverage');
  if (updateSnapshots) args.push('--update');
  if (shard) args.push('--shard', shard);
  if (changed || changedSince) {
    args.push('--changed');
    if (changedSince) args.push(changedSince);
  }
  if (passWithNoTests) args.push('--passWithNoTests');
  if (runtimePlanOutput) args.push('--runtime-plan-output', runtimePlanOutput);
  if (runtimeSettingsOutput) args.push('--runtime-settings-output', runtimeSettingsOutput);
  if (runtimeSettingsGeneration) {
    args.push('--runtime-settings-generation', runtimeSettingsGeneration);
  }
  if (resultOutput) args.push('--result-output', resultOutput);
  for (const architecture of [].concat(architectures || [])) {
    args.push('--architecture', architecture);
  }
  if (passthrough && passthrough.length) args.push('--', ...passthrough.map(String));
  return args;
}

function resolveRstestBin(appDir) {
  const directPackageJson = path.join(
    appDir,
    'node_modules',
    '@meteorjs',
    'rstest',
    'package.json'
  );
  let packageJson = fs.existsSync(directPackageJson)
    ? directPackageJson
    : null;
  if (!packageJson) try {
    packageJson = require.resolve('@meteorjs/rstest/package.json', { paths: [appDir] });
  } catch {
    packageJson = null;
  }
  if (!packageJson || !path.isAbsolute(packageJson) || !fs.existsSync(packageJson)) {
    const error = new Error(
      '[Meteor Rstest] @meteorjs/rstest is missing. ' +
      'Run meteor npm install --save-dev @meteorjs/rstest@0.1.0-beta.0.'
    );
    error.code = 'METEOR_RSTEST_NPM_MISSING';
    throw error;
  }
  return path.join(path.dirname(packageJson), 'bin', 'meteor-rstest.js');
}

function startRstestProcess({
  appDir,
  packageRoot = appDir,
  args,
  env = process.env,
  stdio = 'inherit',
}) {
  const bin = resolveRstestBin(packageRoot);
  const ownsProcessGroup = process.platform !== 'win32';
  const child = spawn(process.execPath, [bin, ...args], {
    cwd: appDir,
    env: {
      ...env,
      NODE_ENV: 'test',
      FORCE_COLOR: env.FORCE_COLOR || '1',
    },
    stdio,
    detached: ownsProcessGroup,
  });
  let settled = false;
  let stopped = false;
  const terminate = signal => {
    if (settled) return;
    if (process.platform === 'win32' && child.pid) {
      const taskkillArgs = ['/pid', String(child.pid), '/t'];
      if (signal === 'SIGKILL') taskkillArgs.push('/f');
      try {
        const killer = spawn('taskkill', taskkillArgs, { stdio: 'ignore' });
        killer.once('error', () => {
          try { child.kill(signal); } catch {}
        });
        return;
      } catch {}
    }
    if (ownsProcessGroup && child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {}
    }
    try {
      child.kill(signal);
    } catch {}
  };
  let completion;
  const stop = async signal => {
    if (stopped || settled) return completion;
    stopped = true;
    terminate(signal || 'SIGTERM');
    let timeoutId;
    const timeout = new Promise(resolve => {
      timeoutId = setTimeout(() => resolve(true), 5000);
      timeoutId.unref?.();
    });
    const timedOut = await Promise.race([
      completion.then(() => false, () => false),
      timeout,
    ]);
    clearTimeout(timeoutId);
    if (timedOut && !settled) {
      terminate('SIGKILL');
      await completion.catch(() => {});
    }
  };
  const signals = ['SIGINT', 'SIGTERM'];
  const handlers = new Map(signals.map(signal => [signal, () => void stop(signal)]));
  for (const [signal, handler] of handlers) process.once(signal, handler);
  const cleanup = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
  completion = new Promise((resolve, reject) => {
    child.once('error', error => {
      settled = true;
      cleanup();
      reject(error);
    });
    child.once('close', (code, signal) => {
      settled = true;
      cleanup();
      resolve(signal ? 1 : code == null ? 1 : code);
    });
  });
  return { child, completion, stop };
}

function runRstestProcess(options) {
  return startRstestProcess(options).completion;
}

module.exports = {
  buildRstestArgs,
  resolveRstestBin,
  runRstestProcess,
  startRstestProcess,
};

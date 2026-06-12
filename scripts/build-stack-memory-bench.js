const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { execSync } = require('child_process');

// Helper to find global meteor
const findGlobalMeteor = () => {
  const homeMeteor = path.join(process.env.HOME || '', '.meteor/meteor');
  if (fs.existsSync(homeMeteor)) return homeMeteor;
  try {
    return execSync('which meteor', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    return null;
  }
};

const DEFAULT_METEOR = path.resolve(__dirname, '../meteor');
const GLOBAL_METEOR = findGlobalMeteor();

// Configuration from Environment Variables
const CONFIG = {
  MODE: process.env.MODE || 'matrix',
  USE_GLOBAL: process.env.USE_GLOBAL === 'true',
  METEOR_PATH: process.env.METEOR_PATH || (process.env.USE_GLOBAL === 'true' ? (GLOBAL_METEOR || DEFAULT_METEOR) : DEFAULT_METEOR),
  APP_PATH: process.argv[2] ? path.resolve(process.argv[2]) : (process.env.APP_PATH || path.resolve(__dirname, '../dist/repro-app')),
  TOUCH_FILE: process.env.TOUCH_FILE || 'server/main.js',
  MAX_CYCLES: parseInt(process.env.MAX_CYCLES, 10) || 10,
  PORT: process.env.PORT || '3333',
  SETTLE_TIME: parseInt(process.env.SETTLE_TIME, 10) || 3000,
  CYCLE_TIMEOUT: parseInt(process.env.CYCLE_TIMEOUT, 10) || 60000,
  LEAK_VARIANT: process.env.LEAK_VARIANT || 'baseline',
  LEAK_RSS_THRESHOLD_MB: parseInt(process.env.LEAK_RSS_THRESHOLD_MB, 10) || 2000,
  LEAK_MAX_CYCLES: parseInt(process.env.LEAK_MAX_CYCLES, 10) || 200,
  HEAPSNAPSHOT_SIGNAL: process.env.HEAPSNAPSHOT_SIGNAL || 'SIGUSR2',
  SNAPSHOT_SETTLE_TIME: parseInt(process.env.SNAPSHOT_SETTLE_TIME, 10) || 6000,
  TOOL_NODE_FLAGS: process.env.TOOL_NODE_FLAGS || '--max-old-space-size=4096 --expose-gc',
  SKIP_RESET: process.env.SKIP_RESET === 'true',
  READY_PATTERN: process.env.READY_PATTERN || 'App running at|Meteor server restarted at',
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Meteor Build Stack Memory Benchmark

Usage:
  node scripts/build-stack-memory-bench.js [APP_PATH]

Environment Variables:
  MODE           'matrix' for the comparison report, 'leak' for long-churn issue-style capture (default: matrix)
  USE_GLOBAL     If 'true', use the system meteor instead of current checkout (default: false)
                 When false, the app is linked to the local npm-packages/meteor-rspack first
                 Legacy is auto-skipped for TypeScript Rspack apps that use zodern:types
  METEOR_PATH    Path to meteor binary (default: checkout or ~/.meteor/meteor)
  APP_PATH       Path to the app to test (default: dist/repro-app)
  TOUCH_FILE     File to modify to trigger rebuild (default: server/main.js)
  MAX_CYCLES     Number of rebuilds to perform (default: 10)
  PORT           Port to run the app on (default: 3333)
  SETTLE_TIME    MS to wait after rebuild before sampling (default: 3000)
  CYCLE_TIMEOUT  MS to wait for initial readiness or next rebuild before failing the variant (default: 60000)
  LEAK_VARIANT   Variant to churn in MODE=leak (default: baseline)
  LEAK_RSS_THRESHOLD_MB Tool RSS threshold that triggers snapshot signaling in MODE=leak (default: 2000)
  LEAK_MAX_CYCLES Max rebuilds to attempt in MODE=leak before stopping (default: 200)
  HEAPSNAPSHOT_SIGNAL Signal sent to the tool process when threshold is hit (default: SIGUSR2)
  SNAPSHOT_SETTLE_TIME MS to wait for heapsnapshot files to stabilize after signaling (default: 6000)
  TOOL_NODE_FLAGS Flags for the Meteor tool (default: --max-old-space-size=4096 --expose-gc)
  SKIP_RESET     If 'true', don't run 'meteor reset' before variants
  READY_PATTERN  Regex pattern to detect app readiness (default: App running at|restarted at)

Example Usage:
  # Basic run using the default reproduction app (dist/repro-app)
  node scripts/build-stack-memory-bench.js

  # Test a specific project with 50 rebuild cycles
  MAX_CYCLES=50 node scripts/build-stack-memory-bench.js ~/projects/my-app

  # Test against the system Meteor (e.g. ~/.meteor/meteor) with a custom port
  USE_GLOBAL=true PORT=4000 node scripts/build-stack-memory-bench.js

  # Stress test a specific large server file and skip 'meteor reset' to preserve cache
  TOUCH_FILE=imports/server/large-module.js SKIP_RESET=true node scripts/build-stack-memory-bench.js

  # Enable Node inspector on the tool to capture heap snapshots manually
  TOOL_NODE_FLAGS="--inspect --max-old-space-size=4096" node scripts/build-stack-memory-bench.js

  # Use a custom regex to detect readiness for a project with unique logs
  READY_PATTERN="Server is now online" node scripts/build-stack-memory-bench.js

  # Run a single long churn like issue #14443 and capture a snapshot once the tool crosses 2 GB RSS
  MODE=leak LEAK_VARIANT=baseline LEAK_RSS_THRESHOLD_MB=2000 TOOL_NODE_FLAGS="--max-old-space-size=4096 --heapsnapshot-signal=SIGUSR2" node scripts/build-stack-memory-bench.js
`);
  process.exit(0);
}

console.log('--- Configuration ---');
Object.entries(CONFIG).forEach(([k, v]) => console.log(`${k.padEnd(15)}: ${v}`));
console.log('---------------------\n');

if (!fs.existsSync(CONFIG.APP_PATH)) {
  console.error('App not found at ' + CONFIG.APP_PATH);
  if (CONFIG.APP_PATH.includes('dist/repro-app')) {
    console.log('Hint: Run "mkdir -p dist && cd dist && ../meteor create --minimal repro-app" first.');
  }
  process.exit(1);
}

const readyRegex = new RegExp(CONFIG.READY_PATTERN);

let hasEnsuredLocalRspackLink = false;

function ensureLocalRspackLink() {
  if (CONFIG.USE_GLOBAL || hasEnsuredLocalRspackLink) {
    return;
  }

  const linkScriptPath = path.resolve(__dirname, '../tools/e2e-tests/scripts/link-rspack.js');
  console.log('Linking local meteor-rspack into the app for local-checkout validation...');
  execFileSync(process.execPath, [linkScriptPath, CONFIG.APP_PATH], {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
  hasEnsuredLocalRspackLink = true;
}

function readAppPackageJson() {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONFIG.APP_PATH, 'package.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

function readMeteorPackagesFile() {
  try {
    return fs.readFileSync(path.join(CONFIG.APP_PATH, '.meteor/packages'), 'utf8');
  } catch (e) {
    return '';
  }
}

function isTypescriptPath(filePath) {
  return typeof filePath === 'string' && /\.(ts|tsx|mts|cts)$/.test(filePath);
}

function shouldSkipLegacyVariant() {
  const packageJson = readAppPackageJson();
  const meteorPackages = readMeteorPackagesFile();
  const mainModules = Object.values(packageJson?.meteor?.mainModule || {});
  const testModule = packageJson?.meteor?.testModule;
  const hasTypescriptEntrypoint = [...mainModules, testModule, CONFIG.TOUCH_FILE].some(isTypescriptPath);
  const hasRspackPackage = /(^|\n)rspack(\s|$)/m.test(meteorPackages);
  const hasZodernTypes = /(^|\n)zodern:types(\s|$)/m.test(meteorPackages);
  return hasTypescriptEntrypoint && hasRspackPackage && hasZodernTypes;
}

function getRSS(pid) {
  try {
    const output = execSync(`ps -o rss= -p ${pid}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    return parseInt(output, 10); // KB
  } catch (e) {
    return 0;
  }
}

function getFDCount(pid) {
  try {
    const output = execSync(`ls /proc/${pid}/fd | wc -l`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    return parseInt(output, 10);
  } catch (e) {
    return 0;
  }
}

function getProcessCommand(pid) {
  try {
    return execSync(`ps -o args= -p ${pid}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    return '';
  }
}

function isAppServerCommand(cmd) {
  return cmd.includes('main.js') && (cmd.includes('.meteor/local/build') || cmd.includes('programs/server'));
}

function getProcessLabel(pid, rootPid, cmd) {
  if (pid === rootPid) {
    return 'meteor-tool';
  }

  if (isAppServerCommand(cmd)) {
    return 'app-server';
  }

  if (cmd.includes('mongod') || cmd.includes('.meteor/local/db')) {
    return 'mongodb';
  }

  if (cmd.includes('ts-checker-rspack-plugin')) {
    return 'ts-checker';
  }

  if (
    cmd.includes('webpack-dev-server') ||
    cmd.includes('@rspack/dev-server') ||
    cmd.includes('@rspack/cli') ||
    cmd.includes('/rspack ') ||
    cmd.includes(' rspack ')
  ) {
    return 'rspack-dev-server';
  }

  if (cmd.includes('node')) {
    return 'node-worker';
  }

  const executable = cmd.split(/\s+/)[0] || 'unknown';
  return path.basename(executable);
}

function getProcessTree(pid) {
  let pids = [pid];
  try {
    const output = execSync(`pgrep -P ${pid}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (output) {
      const children = output.split('\n').filter(Boolean).map(p => parseInt(p, 10));
      for (const child of children) {
        pids = pids.concat(getProcessTree(child));
      }
    }
  } catch (e) {
    // No children
  }
  return pids;
}

function getTreeStats(pid) {
  const pids = getProcessTree(pid);
  let totalRSS = 0;
  let appRSS = 0;
  const breakdown = {};
  const processes = [];

  for (const p of pids) {
    const rss = getRSS(p);
    const cmd = getProcessCommand(p);
    const label = getProcessLabel(p, pid, cmd);
    totalRSS += rss;

    if (label === 'app-server') {
      appRSS = rss;
    }

    breakdown[label] = (breakdown[label] || 0) + rss;
    processes.push({ pid: p, rss, label, cmd });
  }

  const toolRSS = getRSS(pid);
  const otherRSS = Math.max(totalRSS - toolRSS - appRSS, 0);
  return {
    totalRSS, 
    count: pids.length, 
    pids,
    toolRSS,
    toolFDs: getFDCount(pid),
    appRSS,
    otherRSS,
    breakdown,
    processes: processes.sort((a, b) => b.rss - a.rss),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (e) {
    return null;
  }
}

function snapshotSearchDirs() {
  const dirs = [CONFIG.APP_PATH, process.cwd()];
  return [...new Set(dirs.map(dir => path.resolve(dir)))];
}

function formatMtime(filePath) {
  const mtimeMs = getMtimeMs(filePath);
  if (mtimeMs === null) {
    return `${filePath} (missing)`;
  }

  return `${filePath} (${new Date(mtimeMs).toISOString()})`;
}

function getLocalDirPath(appPath) {
  const localRelative = process.env.METEOR_LOCAL_DIR || '.meteor/local';
  return path.isAbsolute(localRelative)
    ? localRelative
    : path.join(appPath, localRelative);
}

function pidExists(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function getListeningPorts(pids) {
  if (!pids.length) {
    return [];
  }

  try {
    const output = execSync(`lsof -Pan -p ${pids.join(',')} -iTCP -sTCP:LISTEN`, {
      stdio: ['pipe', 'pipe', 'ignore']
    }).toString();

    return [...new Set(
      output
        .split('\n')
        .map((line) => {
          const match = line.match(/:(\d+)\s+\(LISTEN\)\s*$/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter(Boolean)
    )];
  } catch (e) {
    return [];
  }
}

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function waitForPortsToClose(ports, timeoutMs) {
  if (!ports.length) {
    return true;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stillOpen = [];
    for (const port of ports) {
      if (await isPortOpen(port)) {
        stillOpen.push(port);
      }
    }

    if (!stillOpen.length) {
      return true;
    }

    await sleep(200);
  }

  return false;
}

function findHeapSnapshotsSince(markMs) {
  const snapshots = [];

  for (const dir of snapshotSearchDirs()) {
    try {
      const output = execSync(`find ${JSON.stringify(dir)} -maxdepth 2 -name '*.heapsnapshot' -printf '%T@ %p\n'`, {
        stdio: ['pipe', 'pipe', 'ignore']
      }).toString();

      output
        .split('\n')
        .filter(Boolean)
        .forEach((line) => {
          const firstSpace = line.indexOf(' ');
          if (firstSpace === -1) return;
          const ts = parseFloat(line.slice(0, firstSpace));
          const filePath = line.slice(firstSpace + 1);
          if (Number.isFinite(ts) && ts * 1000 >= markMs) {
            snapshots.push(filePath);
          }
        });
    } catch (e) {}
  }

  return [...new Set(snapshots)];
}

async function waitForStableHeapSnapshot(markMs) {
  const deadline = Date.now() + CONFIG.CYCLE_TIMEOUT;

  while (Date.now() < deadline) {
    const snapshots = findHeapSnapshotsSince(markMs);
    for (const filePath of snapshots) {
      try {
        const size1 = fs.statSync(filePath).size;
        await sleep(CONFIG.SNAPSHOT_SETTLE_TIME);
        const size2 = fs.statSync(filePath).size;
        if (size1 === size2 && size2 > 1_000_000) {
          return {
            path: filePath,
            sizeBytes: size2,
          };
        }
      } catch (e) {}
    }

    await sleep(1000);
  }

  return null;
}

async function stopProcessTree(rootPid, options = {}) {
  if (!rootPid) {
    return;
  }

  const graceMs = options.graceMs || 2000;
  const waitMs = options.waitMs || 5000;
  const pids = [...new Set(getProcessTree(rootPid))].sort((a, b) => b - a);
  const ports = [...new Set([...getListeningPorts(pids), parseInt(CONFIG.PORT, 10)].filter(Number.isFinite))];

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGINT');
    } catch (e) {}
  }

  await sleep(graceMs);

  const survivors = pids.filter(pidExists);
  for (const pid of survivors) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (e) {}
  }

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!pids.some(pidExists)) {
      break;
    }
    await sleep(200);
  }

  await waitForPortsToClose(ports, waitMs);
}

async function runVariant(name, config, options = {}) {
  const maxCycles = options.maxCycles || CONFIG.MAX_CYCLES;
  const onCycle = options.onCycle || null;

  console.log(`\n>>> Testing variant: ${name}`);
  
  if (name === 'legacy') {
    const packages = fs.readFileSync(path.join(CONFIG.APP_PATH, '.meteor/packages'), 'utf8');
    if (packages.includes('rspack')) {
      console.log('Removing rspack package for legacy test...');
      execSync(`${CONFIG.METEOR_PATH} remove rspack`, { cwd: CONFIG.APP_PATH });
    }
  } else if (name !== 'none') {
    // Ensure rspack is present
    const packages = fs.readFileSync(path.join(CONFIG.APP_PATH, '.meteor/packages'), 'utf8');
    if (!packages.includes('rspack')) {
      console.log('Adding rspack package...');
      execSync(`${CONFIG.METEOR_PATH} add rspack`, { cwd: CONFIG.APP_PATH });
    }
    // Update package.json with config
    const pkgPath = path.join(CONFIG.APP_PATH, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.meteor = pkg.meteor || {};
    pkg.meteor.rspack = config;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  }

  if (!CONFIG.SKIP_RESET) {
    console.log('Resetting meteor...');
    execSync(`${CONFIG.METEOR_PATH} reset`, { cwd: CONFIG.APP_PATH });
  }

  console.log('Starting meteor...');
  const child = spawn(CONFIG.METEOR_PATH, ['run', '--port', CONFIG.PORT], {
    cwd: CONFIG.APP_PATH,
    env: { 
      ...process.env, 
      TOOL_NODE_FLAGS: CONFIG.TOOL_NODE_FLAGS
    }
  });

  let results = [];
  let cycle = 0;
  let isReady = false;
  let isFinished = false;
  let waitTimer = null;
  let lastOutput = '';

  return new Promise((resolve) => {
    const finishVariant = () => {
      if (isFinished) return;
      isFinished = true;
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
      stopProcessTree(child.pid).finally(() => {
        resolve(results);
      });
    };

    const scheduleWaitTimeout = ({ reason, touchPath = null }) => {
      if (waitTimer) {
        clearTimeout(waitTimer);
      }
      waitTimer = setTimeout(() => {
        if (isFinished || isReady) return;

        const stats = getTreeStats(child.pid);
        const touchedInfo = touchPath ? formatMtime(touchPath) : '(none)';
        const serverRspackPath = path.join(CONFIG.APP_PATH, '_build/main-dev/server-rspack.js');
        const localServerPath = path.join(getLocalDirPath(CONFIG.APP_PATH), 'build/main.js');

        console.error(`\nTimeout waiting ${CONFIG.CYCLE_TIMEOUT}ms for ${reason}.`);
        console.error(`  Variant: ${name}`);
        console.error(`  Touch file: ${touchedInfo}`);
        console.error(`  Output check: ${formatMtime(serverRspackPath)}`);
        console.error(`  Local server: ${formatMtime(localServerPath)}`);
        console.error(`  Last output: ${lastOutput || '(none captured)'}`);
        console.error(`  Current RSS: total ${Math.round(stats.totalRSS / 1024)} MB, tool ${Math.round(stats.toolRSS / 1024)} MB, app ${Math.round(stats.appRSS / 1024)} MB`);
        console.error('  The touched file likely did not trigger another rebuild for this variant/app.');

        finishVariant();
      }, CONFIG.CYCLE_TIMEOUT);
    };

    const onReady = async () => {
      if (isFinished || isReady) return;
      isReady = true;
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
      cycle++;
      console.log(`Cycle ${cycle}/${maxCycles} ready.`);
      
      await new Promise(r => setTimeout(r, CONFIG.SETTLE_TIME));

      const stats = getTreeStats(child.pid);
      const serverJsPath = path.join(CONFIG.APP_PATH, '_build/main-dev/server-rspack.js');
      
      const entry = {
        cycle,
        timestamp: new Date().toISOString(),
        totalRSS: Math.round(stats.totalRSS / 1024), 
        toolRSS: Math.round(stats.toolRSS / 1024),   
        appRSS: Math.round(stats.appRSS / 1024),     
        otherRSS: Math.round(stats.otherRSS / 1024),
        processCount: stats.count,
        toolFDs: stats.toolFDs,
        serverJsSize: fs.existsSync(serverJsPath) ? Math.round(fs.statSync(serverJsPath).size / 1024) : 0, 
        processBreakdown: Object.fromEntries(
          Object.entries(stats.breakdown).map(([label, rss]) => [label, Math.round(rss / 1024)])
        ),
        topProcesses: stats.processes.slice(0, 6).map((processInfo) => ({
          pid: processInfo.pid,
          label: processInfo.label,
          rss: Math.round(processInfo.rss / 1024),
          cmd: processInfo.cmd,
        })),
      };
      
      results.push(entry);
      console.log(`  RSS Total: ${entry.totalRSS} MB, Tool: ${entry.toolRSS} MB, App: ${entry.appRSS} MB, Other: ${entry.otherRSS} MB, FDs: ${entry.toolFDs}, Procs: ${stats.count}`);

      if (onCycle) {
        const outcome = await onCycle({ entry, results, cycle, child });
        if (outcome && outcome.stop) {
          if (outcome.reason) {
            console.log(`Stopping variant early: ${outcome.reason}`);
          }
          finishVariant();
          return;
        }
      }

      if (cycle < maxCycles) {
        isReady = false;
        const mainPath = path.join(CONFIG.APP_PATH, CONFIG.TOUCH_FILE);
        if (fs.existsSync(mainPath)) {
          fs.appendFileSync(mainPath, `\n// ${Date.now()}`);
          scheduleWaitTimeout({
            reason: `cycle ${cycle + 1} readiness after touching ${CONFIG.TOUCH_FILE}`,
            touchPath: mainPath,
          });
        } else {
           console.log(`Warning: Touch file ${CONFIG.TOUCH_FILE} not found.`);
           finishVariant();
        }
      } else {
        console.log('Test variant complete. Killing meteor...');
        finishVariant();
      }
    };

    child.stdout.on('data', (data) => {
      const str = data.toString();
      process.stdout.write(str);
      const trimmed = str.trim();
      if (trimmed) {
        lastOutput = trimmed.split('\n').pop();
      }
      if (readyRegex.test(str)) {
        onReady();
      }
    });

    child.stderr.on('data', (data) => {
      const str = data.toString();
      process.stderr.write(str);
      const trimmed = str.trim();
      if (trimmed) {
        lastOutput = trimmed.split('\n').pop();
      }
    });

    child.on('exit', (code) => {
      if (isFinished) {
        return;
      }
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
      if (cycle < maxCycles) {
        console.log(`Meteor process exited prematurely (code ${code})`);
        resolve(results);
      }
    });

    scheduleWaitTimeout({ reason: 'initial startup' });
  });
}

const matrix = [
  { name: 'legacy', config: {} },
  { name: 'baseline', config: {} },
  { name: 'cache:false', config: { cache: false } },
  { name: 'devtool:false', config: { devtool: false } },
  { name: 'cheap-source-map', config: { devtool: 'cheap-source-map' } },
  { name: 'cache:false+devtool:false', config: { cache: false, devtool: false } },
];

let activeMatrixCache = null;

function getActiveMatrix() {
  if (activeMatrixCache) {
    return activeMatrixCache;
  }

  if (!shouldSkipLegacyVariant()) {
    activeMatrixCache = matrix;
    return activeMatrixCache;
  }

  console.log('Skipping legacy variant: TypeScript Rspack app with zodern:types would emit expected legacy-only lint noise.');
  activeMatrixCache = matrix.filter(item => item.name !== 'legacy');
  return activeMatrixCache;
}

function getVariantByName(name) {
  return getActiveMatrix().find(item => item.name === name) || null;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function max(values) {
  if (!values.length) return 0;
  return Math.max(...values);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function analyzeResults(res) {
  if (!res.length) {
    return null;
  }

  const totals = res.map(r => r.totalRSS);
  const tools = res.map(r => r.toolRSS);
  const apps = res.map(r => r.appRSS);
  const others = res.map(r => r.otherRSS || 0);
  const fds = res.map(r => r.toolFDs);
  const procs = res.map(r => r.processCount);
  const serverJsSizes = res.map(r => r.serverJsSize);
  const warmRes = res.slice(Math.min(2, res.length));
  const warmTotals = warmRes.map(r => r.totalRSS);
  const warmTools = warmRes.map(r => r.toolRSS);
  const warmApps = warmRes.map(r => r.appRSS);
  const warmOthers = warmRes.map(r => r.otherRSS || 0);

  const start = res[0];
  const end = res[res.length - 1];
  const rebuilds = Math.max(res.length - 1, 0);
  const breakdownByLabel = {};

  for (const entry of res) {
    for (const [label, rss] of Object.entries(entry.processBreakdown || {})) {
      if (!breakdownByLabel[label]) {
        breakdownByLabel[label] = [];
      }
      breakdownByLabel[label].push(rss);
    }
  }

  const processLabels = Object.entries(breakdownByLabel)
    .map(([label, values]) => ({
      label,
      avgRSS: average(values),
      peakRSS: max(values),
      startRSS: values[0] || 0,
      endRSS: values[values.length - 1] || 0,
      deltaRSS: (values[values.length - 1] || 0) - (values[0] || 0),
    }))
    .sort((a, b) => b.avgRSS - a.avgRSS);

  return {
    samples: res.length,
    rebuilds,
    start,
    end,
    deltaTotal: end.totalRSS - start.totalRSS,
    deltaTool: end.toolRSS - start.toolRSS,
    deltaApp: end.appRSS - start.appRSS,
    deltaOther: (end.otherRSS || 0) - (start.otherRSS || 0),
    slopeTotal: rebuilds > 0 ? (end.totalRSS - start.totalRSS) / rebuilds : null,
    slopeTool: rebuilds > 0 ? (end.toolRSS - start.toolRSS) / rebuilds : null,
    slopeApp: rebuilds > 0 ? (end.appRSS - start.appRSS) / rebuilds : null,
    slopeOther: rebuilds > 0 ? ((end.otherRSS || 0) - (start.otherRSS || 0)) / rebuilds : null,
    avgTotal: average(totals),
    avgTool: average(tools),
    avgApp: average(apps),
    avgOther: average(others),
    medianTotal: median(totals),
    medianTool: median(tools),
    medianApp: median(apps),
    medianOther: median(others),
    peakTotal: max(totals),
    peakTool: max(tools),
    peakApp: max(apps),
    peakOther: max(others),
    postWarmSamples: warmRes.length,
    postWarmAvgTotal: average(warmTotals),
    postWarmAvgTool: average(warmTools),
    postWarmAvgApp: average(warmApps),
    postWarmAvgOther: average(warmOthers),
    postWarmMedianTotal: median(warmTotals),
    postWarmMedianTool: median(warmTools),
    postWarmMedianApp: median(warmApps),
    postWarmMedianOther: median(warmOthers),
    avgFDs: average(fds),
    peakFDs: max(fds),
    avgProcs: average(procs),
    peakProcs: max(procs),
    avgServerJsSize: average(serverJsSizes),
    peakServerJsSize: max(serverJsSizes),
    processLabels,
  };
}

function formatSignedNumber(value, width = 5, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return `${'n/a'.padStart(width)}${suffix}`;
  }

  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1).padStart(width)}${suffix}`;
}

function padCell(value, width, align = 'left') {
  const stringValue = String(value);
  return align === 'right'
    ? stringValue.padStart(width)
    : stringValue.padEnd(width);
}

async function runLeakHarness() {
  const variant = getVariantByName(CONFIG.LEAK_VARIANT);
  if (!variant) {
    throw new Error(`Unknown LEAK_VARIANT "${CONFIG.LEAK_VARIANT}". Expected one of: ${matrix.map(item => item.name).join(', ')}`);
  }

  const results = await runVariant(variant.name, variant.config, {
    maxCycles: CONFIG.LEAK_MAX_CYCLES,
    onCycle: async ({ entry, child, cycle }) => {
      const toolRss = entry.toolRSS;
      if (toolRss < CONFIG.LEAK_RSS_THRESHOLD_MB) {
        return { stop: false };
      }

      console.log(`Threshold hit at cycle ${cycle}: tool RSS ${toolRss} MB >= ${CONFIG.LEAK_RSS_THRESHOLD_MB} MB`);

      const markMs = Date.now();
      try {
        process.kill(child.pid, CONFIG.HEAPSNAPSHOT_SIGNAL);
      } catch (e) {
        console.error(`Failed to send ${CONFIG.HEAPSNAPSHOT_SIGNAL} to tool pid ${child.pid}: ${e.message}`);
        return {
          stop: true,
          reason: `threshold hit but snapshot signal failed: ${e.message}`,
          extra: {
            snapshot: null,
            thresholdReached: true,
          },
        };
      }

      console.log(`Sent ${CONFIG.HEAPSNAPSHOT_SIGNAL} to tool pid ${child.pid}. Waiting for heapsnapshot...`);
      const snapshot = await waitForStableHeapSnapshot(markMs);

      if (snapshot) {
        console.log(`Heapsnapshot captured: ${snapshot.path} (${Math.round(snapshot.sizeBytes / 1048576)} MB)`);
      } else {
        console.log('No stable heapsnapshot found before timeout.');
      }

      return {
        stop: true,
        reason: snapshot
          ? `threshold hit and heapsnapshot captured at cycle ${cycle}`
          : `threshold hit at cycle ${cycle} but no stable heapsnapshot was found`,
        extra: {
          snapshot,
          thresholdReached: true,
        },
      };
    },
  });

  const stats = analyzeResults(results);
  const report = {
    mode: 'leak',
    variant: variant.name,
    thresholdMb: CONFIG.LEAK_RSS_THRESHOLD_MB,
    maxCycles: CONFIG.LEAK_MAX_CYCLES,
    touchFile: CONFIG.TOUCH_FILE,
    toolNodeFlags: CONFIG.TOOL_NODE_FLAGS,
    results,
    summary: stats,
    issueStyle: stats && stats.rebuilds > 0
      ? {
          toolStartMb: stats.start.toolRSS,
          toolEndMb: stats.end.toolRSS,
          toolDeltaMb: stats.deltaTool,
          toolSlopeMbPerRebuild: stats.slopeTool,
          appStartMb: stats.start.appRSS,
          appEndMb: stats.end.appRSS,
          appDeltaMb: stats.deltaApp,
          otherStartMb: stats.start.otherRSS,
          otherEndMb: stats.end.otherRSS,
          otherDeltaMb: stats.deltaOther,
          totalStartMb: stats.start.totalRSS,
          totalEndMb: stats.end.totalRSS,
          totalDeltaMb: stats.deltaTotal,
        }
      : null,
  };

  fs.writeFileSync('leak-report.json', JSON.stringify(report, null, 2));

  console.log('\n=== LEAK HARNESS SUMMARY ===');
  if (!stats) {
    console.log('No data collected.');
  } else {
    console.log(`Variant: ${variant.name}`);
    console.log(`Samples: ${stats.samples}, Rebuilds: ${stats.rebuilds}`);
    console.log(`Tool RSS: ${stats.start.toolRSS} -> ${stats.end.toolRSS} MB (${stats.deltaTool >= 0 ? '+' : ''}${stats.deltaTool} MB)`);
    console.log(`App RSS:  ${stats.start.appRSS} -> ${stats.end.appRSS} MB (${stats.deltaApp >= 0 ? '+' : ''}${stats.deltaApp} MB)`);
    console.log(`Other RSS:${stats.start.otherRSS} -> ${stats.end.otherRSS} MB (${stats.deltaOther >= 0 ? '+' : ''}${stats.deltaOther} MB)`);
    if (stats.slopeTool !== null) {
      console.log(`Tool slope: ${formatSignedNumber(stats.slopeTool, 5, ' MB/rebuild')}`);
    }
  }
  console.log('Saved leak-report.json');
}

async function main() {
  ensureLocalRspackLink();

  if (CONFIG.MODE === 'leak') {
    await runLeakHarness();
    return;
  }

  const allResults = {};
  const summary = {};
  const variantWidth = 25;
  const activeMatrix = getActiveMatrix();

  for (const item of activeMatrix) {
    allResults[item.name] = await runVariant(item.name, item.config);
    summary[item.name] = analyzeResults(allResults[item.name]);
  }

  console.log('\n\n=== FINAL REPRODUCTION SUMMARY ===');
  console.log(
    `${padCell('Variant', variantWidth)} | ${padCell('Tool Slope', 15)} | ${padCell('App Slope', 14)} | ${padCell('Total Slope (MB/rebuild)', 25)}`
  );
  console.log('-'.repeat(variantWidth + 3 + 15 + 3 + 14 + 3 + 25));

  let csv = 'Variant,Cycle,TotalRSS,ToolRSS,AppRSS,OtherRSS,FDs,Procs,ServerJsKB\n';

  for (const name in allResults) {
    const res = allResults[name];
    const stats = summary[name];

    if (!stats) {
      console.log(`${name.padEnd(25)} | No data collected`);
      continue;
    }

    if (stats.slopeTotal === null) {
      console.log(`${padCell(name, variantWidth)} | Insufficient data collected`);
      continue;
    }

    console.log(
      `${padCell(name, variantWidth)} | ${padCell(formatSignedNumber(stats.slopeTool, 5, ' MB'), 15, 'right')} | ${padCell(formatSignedNumber(stats.slopeApp, 5, ' MB'), 14, 'right')} | ${padCell(formatSignedNumber(stats.slopeTotal, 5, ' MB'), 25, 'right')}`
    );

    res.forEach(r => {
      csv += `${name},${r.cycle},${r.totalRSS},${r.toolRSS},${r.appRSS},${r.otherRSS},${r.toolFDs},${r.processCount},${r.serverJsSize}\n`;
    });
  }

  console.log('\n=== RESOURCE AVERAGES / PEAKS ===');
  console.log(
    `${padCell('Variant', variantWidth)} | ${padCell('Avg Total', 12)} | ${padCell('Peak Total', 13)} | ${padCell('Avg Tool', 11)} | ${padCell('Peak Tool', 12)} | ${padCell('Avg App', 10)} | ${padCell('Peak App', 11)}`
  );
  console.log('-'.repeat(variantWidth + 3 + 12 + 3 + 13 + 3 + 11 + 3 + 12 + 3 + 10 + 3 + 11));

  for (const name in summary) {
    const stats = summary[name];
    if (!stats) {
      console.log(`${name.padEnd(25)} | No data collected`);
      continue;
    }

    console.log(
      `${padCell(name, variantWidth)} | ${padCell(`${stats.avgTotal.toFixed(1)} MB`, 12, 'right')} | ${padCell(`${stats.peakTotal} MB`, 13, 'right')} | ${padCell(`${stats.avgTool.toFixed(1)} MB`, 11, 'right')} | ${padCell(`${stats.peakTool} MB`, 12, 'right')} | ${padCell(`${stats.avgApp.toFixed(1)} MB`, 10, 'right')} | ${padCell(`${stats.peakApp} MB`, 11, 'right')}`
    );
  }

  console.log('\n=== MEDIANS / POST-WARM ===');
  console.log(
    `${padCell('Variant', variantWidth)} | ${padCell('Median Tool', 13)} | ${padCell('Warm Avg Tool', 15)} | ${padCell('Warm Median Tool', 18)} | ${padCell('Warm Avg Total', 16)} | ${padCell('Warm Avg App', 14)}`
  );
  console.log('-'.repeat(variantWidth + 3 + 13 + 3 + 15 + 3 + 18 + 3 + 16 + 3 + 14));

  for (const name in summary) {
    const stats = summary[name];
    if (!stats) {
      console.log(`${name.padEnd(25)} | No data collected`);
      continue;
    }

    console.log(
      `${padCell(name, variantWidth)} | ${padCell(`${stats.medianTool.toFixed(1)} MB`, 13, 'right')} | ${padCell(`${stats.postWarmAvgTool.toFixed(1)} MB`, 15, 'right')} | ${padCell(`${stats.postWarmMedianTool.toFixed(1)} MB`, 18, 'right')} | ${padCell(`${stats.postWarmAvgTotal.toFixed(1)} MB`, 16, 'right')} | ${padCell(`${stats.postWarmAvgApp.toFixed(1)} MB`, 14, 'right')}`
    );
  }

  console.log('\n=== DELTAS / OVERHEAD ===');
  console.log(
    `${padCell('Variant', variantWidth)} | ${padCell('Samples', 7)} | ${padCell('Rebuilds', 8)} | ${padCell('Total Delta', 12)} | ${padCell('Tool Delta', 11)} | ${padCell('App Delta', 10)} | ${padCell('Other Delta', 12)} | ${padCell('Avg FDs', 8)} | ${padCell('Avg Procs', 10)} | ${padCell('Avg ServerJs', 13)}`
  );
  console.log('-'.repeat(variantWidth + 3 + 7 + 3 + 8 + 3 + 12 + 3 + 11 + 3 + 10 + 3 + 12 + 3 + 8 + 3 + 10 + 3 + 13));

  for (const name in summary) {
    const stats = summary[name];
    if (!stats) {
      console.log(`${name.padEnd(25)} | No data collected`);
      continue;
    }

    console.log(
      `${padCell(name, variantWidth)} | ${padCell(stats.samples, 7, 'right')} | ${padCell(stats.rebuilds, 8, 'right')} | ${padCell(`${stats.deltaTotal >= 0 ? '+' : ''}${stats.deltaTotal} MB`, 12, 'right')} | ${padCell(`${stats.deltaTool >= 0 ? '+' : ''}${stats.deltaTool} MB`, 11, 'right')} | ${padCell(`${stats.deltaApp >= 0 ? '+' : ''}${stats.deltaApp} MB`, 10, 'right')} | ${padCell(`${stats.deltaOther >= 0 ? '+' : ''}${stats.deltaOther} MB`, 12, 'right')} | ${padCell(stats.avgFDs.toFixed(1), 8, 'right')} | ${padCell(stats.avgProcs.toFixed(1), 10, 'right')} | ${padCell(`${stats.avgServerJsSize.toFixed(1)} KB`, 13, 'right')}`
    );
  }

  console.log('\n=== OTHER PROCESS ATTRIBUTION ===');
  console.log(
    `${padCell('Variant', variantWidth)} | ${padCell('Avg Other', 11)} | ${padCell('Peak Other', 12)} | ${padCell('Top Other Avg', 16)} | ${padCell('Top Other Delta', 18)}`
  );
  console.log('-'.repeat(variantWidth + 3 + 11 + 3 + 12 + 3 + 16 + 3 + 18));

  for (const name in summary) {
    const stats = summary[name];
    if (!stats) {
      console.log(`${name.padEnd(25)} | No data collected`);
      continue;
    }

    const otherLabels = (stats.processLabels || []).filter(({ label }) => !['meteor-tool', 'app-server'].includes(label));
    const topOtherAvg = otherLabels[0] || null;
    const topOtherDelta = [...otherLabels].sort((a, b) => b.deltaRSS - a.deltaRSS)[0] || null;
    const topOtherAvgText = topOtherAvg ? `${topOtherAvg.label} ${topOtherAvg.avgRSS.toFixed(1)} MB` : 'n/a';
    const topOtherDeltaText = topOtherDelta ? `${topOtherDelta.label} ${topOtherDelta.deltaRSS >= 0 ? '+' : ''}${topOtherDelta.deltaRSS} MB` : 'n/a';

    console.log(
      `${padCell(name, variantWidth)} | ${padCell(`${stats.avgOther.toFixed(1)} MB`, 11, 'right')} | ${padCell(`${stats.peakOther} MB`, 12, 'right')} | ${padCell(topOtherAvgText, 16, 'right')} | ${padCell(topOtherDeltaText, 18, 'right')}`
    );
  }

  const legacyStats = summary.legacy || null;
  const baselineStats = summary.baseline || null;

  console.log('\n=== DELTA VS LEGACY / BASELINE ===');
  console.log(
    `${padCell('Variant', variantWidth)} | ${padCell('vs Legacy Avg Tool', 18)} | ${padCell('vs Legacy Avg Total', 19)} | ${padCell('vs Baseline Avg Tool', 20)} | ${padCell('vs Baseline Avg Total', 21)} | ${padCell('vs Baseline Warm Tool', 22)}`
  );
  console.log('-'.repeat(variantWidth + 3 + 18 + 3 + 19 + 3 + 20 + 3 + 21 + 3 + 22));

  for (const name in summary) {
    const stats = summary[name];
    if (!stats) {
      console.log(`${name.padEnd(25)} | No data collected`);
      continue;
    }

    const deltaVsLegacyAvgTool = legacyStats ? stats.avgTool - legacyStats.avgTool : null;
    const deltaVsLegacyAvgTotal = legacyStats ? stats.avgTotal - legacyStats.avgTotal : null;
    const deltaVsBaselineAvgTool = baselineStats ? stats.avgTool - baselineStats.avgTool : null;
    const deltaVsBaselineAvgTotal = baselineStats ? stats.avgTotal - baselineStats.avgTotal : null;
    const deltaVsBaselineWarmTool = baselineStats ? stats.postWarmAvgTool - baselineStats.postWarmAvgTool : null;

    console.log(
      `${padCell(name, variantWidth)} | ${padCell(formatSignedNumber(deltaVsLegacyAvgTool, 6, ' MB'), 18, 'right')} | ${padCell(formatSignedNumber(deltaVsLegacyAvgTotal, 7, ' MB'), 19, 'right')} | ${padCell(formatSignedNumber(deltaVsBaselineAvgTool, 8, ' MB'), 20, 'right')} | ${padCell(formatSignedNumber(deltaVsBaselineAvgTotal, 9, ' MB'), 21, 'right')} | ${padCell(formatSignedNumber(deltaVsBaselineWarmTool, 8, ' MB'), 22, 'right')}`
    );
  }

  fs.writeFileSync('repro-report.json', JSON.stringify(allResults, null, 2));
  fs.writeFileSync('repro-summary.json', JSON.stringify(summary, null, 2));
  fs.writeFileSync('repro-report.csv', csv);
  console.log('\nDetailed reports saved to repro-report.json, repro-summary.json and repro-report.csv');
}

main().catch(err => {
  console.error('Fatal error in reproduction tool:');
  console.error(err);
  process.exit(1);
});

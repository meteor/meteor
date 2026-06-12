const { spawn } = require('child_process');
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
  USE_GLOBAL: process.env.USE_GLOBAL === 'true',
  METEOR_PATH: process.env.METEOR_PATH || (process.env.USE_GLOBAL === 'true' ? (GLOBAL_METEOR || DEFAULT_METEOR) : DEFAULT_METEOR),
  APP_PATH: process.argv[2] ? path.resolve(process.argv[2]) : (process.env.APP_PATH || path.resolve(__dirname, '../dist/repro-app')),
  TOUCH_FILE: process.env.TOUCH_FILE || 'server/main.js',
  MAX_CYCLES: parseInt(process.env.MAX_CYCLES, 10) || 10,
  PORT: process.env.PORT || '3333',
  SETTLE_TIME: parseInt(process.env.SETTLE_TIME, 10) || 3000,
  CYCLE_TIMEOUT: parseInt(process.env.CYCLE_TIMEOUT, 10) || 60000,
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
  USE_GLOBAL     If 'true', use the system meteor instead of current checkout (default: false)
  METEOR_PATH    Path to meteor binary (default: checkout or ~/.meteor/meteor)
  APP_PATH       Path to the app to test (default: dist/repro-app)
  TOUCH_FILE     File to modify to trigger rebuild (default: server/main.js)
  MAX_CYCLES     Number of rebuilds to perform (default: 10)
  PORT           Port to run the app on (default: 3333)
  SETTLE_TIME    MS to wait after rebuild before sampling (default: 3000)
  CYCLE_TIMEOUT  MS to wait for initial readiness or next rebuild before failing the variant (default: 60000)
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

  for (const p of pids) {
    const rss = getRSS(p);
    totalRSS += rss;
    
    if (p !== pid) {
      try {
        const cmd = execSync(`ps -o args= -p ${p}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
        if (cmd.includes('main.js') && (cmd.includes('.meteor/local/build') || cmd.includes('programs/server'))) {
           appRSS = rss;
        }
      } catch (e) {}
    }
  }
  return { 
    totalRSS, 
    count: pids.length, 
    pids,
    toolRSS: getRSS(pid),
    toolFDs: getFDCount(pid),
    appRSS
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

async function runVariant(name, config) {
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
      console.log(`Cycle ${cycle}/${CONFIG.MAX_CYCLES} ready.`);
      
      await new Promise(r => setTimeout(r, CONFIG.SETTLE_TIME));

      const stats = getTreeStats(child.pid);
      const serverJsPath = path.join(CONFIG.APP_PATH, '_build/main-dev/server-rspack.js');
      
      const entry = {
        cycle,
        timestamp: new Date().toISOString(),
        totalRSS: Math.round(stats.totalRSS / 1024), 
        toolRSS: Math.round(stats.toolRSS / 1024),   
        appRSS: Math.round(stats.appRSS / 1024),     
        processCount: stats.count,
        toolFDs: stats.toolFDs,
        serverJsSize: fs.existsSync(serverJsPath) ? Math.round(fs.statSync(serverJsPath).size / 1024) : 0, 
      };
      
      results.push(entry);
      console.log(`  RSS Total: ${entry.totalRSS} MB, Tool: ${entry.toolRSS} MB, App: ${entry.appRSS} MB, FDs: ${entry.toolFDs}, Procs: ${stats.count}`);

      if (cycle < CONFIG.MAX_CYCLES) {
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
      if (cycle < CONFIG.MAX_CYCLES) {
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

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function max(values) {
  if (!values.length) return 0;
  return Math.max(...values);
}

function analyzeResults(res) {
  if (!res.length) {
    return null;
  }

  const totals = res.map(r => r.totalRSS);
  const tools = res.map(r => r.toolRSS);
  const apps = res.map(r => r.appRSS);
  const fds = res.map(r => r.toolFDs);
  const procs = res.map(r => r.processCount);
  const serverJsSizes = res.map(r => r.serverJsSize);

  const start = res[0];
  const end = res[res.length - 1];
  const rebuilds = Math.max(res.length - 1, 0);

  return {
    samples: res.length,
    rebuilds,
    start,
    end,
    deltaTotal: end.totalRSS - start.totalRSS,
    deltaTool: end.toolRSS - start.toolRSS,
    deltaApp: end.appRSS - start.appRSS,
    slopeTotal: rebuilds > 0 ? (end.totalRSS - start.totalRSS) / rebuilds : null,
    slopeTool: rebuilds > 0 ? (end.toolRSS - start.toolRSS) / rebuilds : null,
    slopeApp: rebuilds > 0 ? (end.appRSS - start.appRSS) / rebuilds : null,
    avgTotal: average(totals),
    avgTool: average(tools),
    avgApp: average(apps),
    peakTotal: max(totals),
    peakTool: max(tools),
    peakApp: max(apps),
    avgFDs: average(fds),
    peakFDs: max(fds),
    avgProcs: average(procs),
    peakProcs: max(procs),
    avgServerJsSize: average(serverJsSizes),
    peakServerJsSize: max(serverJsSizes),
  };
}

async function main() {
  const allResults = {};
  const summary = {};
  
  for (const item of matrix) {
    allResults[item.name] = await runVariant(item.name, item.config);
    summary[item.name] = analyzeResults(allResults[item.name]);
  }

  console.log('\n\n=== FINAL REPRODUCTION SUMMARY ===');
  console.log('Variant'.padEnd(25) + ' | Tool Slope | App Slope | Total Slope (MB/rebuild)');
  console.log('-'.repeat(95));

  let csv = 'Variant,Cycle,TotalRSS,ToolRSS,AppRSS,FDs,Procs,ServerJsKB\n';

  for (const name in allResults) {
    const res = allResults[name];
    const stats = summary[name];

    if (!stats) {
      console.log(`${name.padEnd(25)} | No data collected`);
      continue;
    }

    if (stats.slopeTotal === null) {
      console.log(`${name.padEnd(25)} | Insufficient data collected`);
      continue;
    }

    console.log(`${name.padEnd(25)} | ${stats.slopeTool >= 0 ? '+' : ''}${stats.slopeTool.toFixed(1).padStart(5)} MB | ${stats.slopeApp >= 0 ? '+' : ''}${stats.slopeApp.toFixed(1).padStart(5)} MB | ${stats.slopeTotal >= 0 ? '+' : ''}${stats.slopeTotal.toFixed(1).padStart(5)} MB`);

    res.forEach(r => {
      csv += `${name},${r.cycle},${r.totalRSS},${r.toolRSS},${r.appRSS},${r.toolFDs},${r.processCount},${r.serverJsSize}\n`;
    });
  }

  console.log('\n=== RESOURCE AVERAGES / PEAKS ===');
  console.log('Variant'.padEnd(25) + ' | Avg Total | Peak Total | Avg Tool | Peak Tool | Avg App | Peak App');
  console.log('-'.repeat(105));

  for (const name in summary) {
    const stats = summary[name];
    if (!stats) {
      console.log(`${name.padEnd(25)} | No data collected`);
      continue;
    }

    console.log(
      `${name.padEnd(25)} | ${stats.avgTotal.toFixed(1).padStart(7)} MB | ${String(stats.peakTotal).padStart(10)} MB | ${stats.avgTool.toFixed(1).padStart(7)} MB | ${String(stats.peakTool).padStart(9)} MB | ${stats.avgApp.toFixed(1).padStart(6)} MB | ${String(stats.peakApp).padStart(8)} MB`
    );
  }

  console.log('\n=== DELTAS / OVERHEAD ===');
  console.log('Variant'.padEnd(25) + ' | Samples | Rebuilds | Total Delta | Tool Delta | App Delta | Avg FDs | Avg Procs | Avg ServerJs');
  console.log('-'.repeat(125));

  for (const name in summary) {
    const stats = summary[name];
    if (!stats) {
      console.log(`${name.padEnd(25)} | No data collected`);
      continue;
    }

    console.log(
      `${name.padEnd(25)} | ${String(stats.samples).padStart(7)} | ${String(stats.rebuilds).padStart(8)} | ${stats.deltaTotal >= 0 ? '+' : ''}${String(stats.deltaTotal).padStart(5)} MB | ${stats.deltaTool >= 0 ? '+' : ''}${String(stats.deltaTool).padStart(4)} MB | ${stats.deltaApp >= 0 ? '+' : ''}${String(stats.deltaApp).padStart(3)} MB | ${stats.avgFDs.toFixed(1).padStart(7)} | ${stats.avgProcs.toFixed(1).padStart(9)} | ${stats.avgServerJsSize.toFixed(1).padStart(12)} KB`
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

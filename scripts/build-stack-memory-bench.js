const { spawn } = require('child_process');
const fs = require('fs');
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

  return new Promise((resolve) => {
    const onReady = async () => {
      if (isReady) return;
      isReady = true;
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
        } else {
           console.log(`Warning: Touch file ${CONFIG.TOUCH_FILE} not found.`);
        }
      } else {
        console.log('Test variant complete. Killing meteor...');
        child.kill('SIGINT');
        setTimeout(() => {
          child.kill('SIGKILL');
          resolve(results);
        }, 5000);
      }
    };

    child.stdout.on('data', (data) => {
      const str = data.toString();
      process.stdout.write(str);
      if (readyRegex.test(str)) {
        onReady();
      }
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });

    child.on('exit', (code) => {
      if (cycle < CONFIG.MAX_CYCLES) {
        console.log(`Meteor process exited prematurely (code ${code})`);
        resolve(results);
      }
    });
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

async function main() {
  const allResults = {};
  
  for (const item of matrix) {
    allResults[item.name] = await runVariant(item.name, item.config);
  }

  console.log('\n\n=== FINAL REPRODUCTION SUMMARY ===');
  console.log('Variant'.padEnd(25) + ' | Tool Slope | App Slope | Total Slope (MB/rebuild)');
  console.log('-'.repeat(95));

  let csv = 'Variant,Cycle,TotalRSS,ToolRSS,AppRSS,FDs,Procs,ServerJsKB\n';

  for (const name in allResults) {
    const res = allResults[name];
    if (res.length < 2) {
      console.log(`${name.padEnd(25)} | Insufficient data collected`);
      continue;
    }
    
    const start = res[0];
    const end = res[res.length - 1];
    const cycles = res.length - 1;
    
    const slopeTotal = (end.totalRSS - start.totalRSS) / cycles;
    const slopeTool = (end.toolRSS - start.toolRSS) / cycles;
    const slopeApp = (end.appRSS - start.appRSS) / cycles;

    console.log(`${name.padEnd(25)} | +${slopeTool.toFixed(1).padStart(5)} MB | +${slopeApp.toFixed(1).padStart(5)} MB | +${slopeTotal.toFixed(1).padStart(5)} MB`);

    res.forEach(r => {
      csv += `${name},${r.cycle},${r.totalRSS},${r.toolRSS},${r.appRSS},${r.toolFDs},${r.processCount},${r.serverJsSize}\n`;
    });
  }

  fs.writeFileSync('repro-report.json', JSON.stringify(allResults, null, 2));
  fs.writeFileSync('repro-report.csv', csv);
  console.log('\nDetailed reports saved to repro-report.json and repro-report.csv');
}

main().catch(err => {
  console.error('Fatal error in reproduction tool:');
  console.error(err);
  process.exit(1);
});

// Runs while file descriptor 9 holds the shared Linux flock. Pass that
// descriptor to the installer so cancellation cannot release the lock before
// an orphaned installer has finished extracting Chrome.
const { spawn, execFile } = require('node:child_process');
const { rmSync, statSync } = require('node:fs');
const { join } = require('node:path');

const puppeteerDir = process.argv[2];
const puppeteer = require(puppeteerDir);
const cacheDir = process.env.PUPPETEER_CACHE_DIR;

function runFile(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, error => error ? reject(error) : resolve());
  });
}

async function browserAvailable() {
  try {
    const executable = await puppeteer.executablePath();
    if (!statSync(executable).isFile()) return false;
    await runFile(executable, ['--version'], { timeout: 30000 });
    return true;
  } catch {
    return false;
  }
}

async function install() {
  if (await browserAvailable()) return;

  // Puppeteer skips existing directories, including partial extractions.
  rmSync(cacheDir, { force: true, recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(puppeteerDir, 'install.mjs')], {
      env: { ...process.env, PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD: 'true' },
      stdio: ['ignore', 'inherit', 'inherit', 9],
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Puppeteer installer exited with ${signal || code}`));
    });
  });

  if (!await browserAvailable()) {
    throw new Error('Chrome for Puppeteer is unavailable after installation');
  }
}

install().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

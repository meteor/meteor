const execa = require("execa");

const INSTALL_HINT =
  "Maestro is not on PATH. Install with:\n" +
  "  curl -fsSL https://get.maestro.mobile.dev | bash";

async function checkMaestro({ exec = execa } = {}) {
  try {
    const result = await exec("maestro", ["--version"], { reject: false });
    if (result.exitCode === 0) {
      return { ok: true, version: result.stdout.trim() };
    }
    return { ok: false, hint: INSTALL_HINT, stderr: result.stderr };
  } catch (err) {
    return { ok: false, hint: INSTALL_HINT, error: err.message };
  }
}

async function main() {
  const result = await checkMaestro();
  if (result.ok) {
    console.log(`maestro found: ${result.version}`);
    process.exit(0);
  }
  console.error(result.hint);
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { checkMaestro, INSTALL_HINT };

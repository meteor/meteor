const fs = require('fs');
const path = require('path');

const { Worker, parentPort, workerData } = require('node:worker_threads');

const configExtensions = ['.ts', '.js', '.cjs', '.mjs', '.json'];
let configImportVersion = 0;

function findProjectConfig(appDir, baseName) {
  for (const ext of configExtensions) {
    const file = path.join(appDir, baseName + ext);
    if (fs.existsSync(file)) return file;
  }
}

async function readProjectConfig(configPath) {
  if (configPath.endsWith('.mjs')) {
    const { pathToFileURL } = require('url');
    const url = pathToFileURL(configPath);
    url.searchParams.set('meteor_config', String(++configImportVersion));
    const mod = await import(url.href);
    return mod.default ?? mod;
  }
  if (configPath.endsWith('.json')) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  // Resolve TypeScript and the config's imports from the application's dependencies.
  const { createRequire } = require('module');
  const nodeRequire = createRequire(configPath);
  delete nodeRequire.cache[nodeRequire.resolve(configPath)];
  let mod;
  if (configPath.endsWith('.ts')) {
    const ts = nodeRequire('typescript');
    const previous = nodeRequire.extensions['.ts'];
    try {
      nodeRequire.extensions['.ts'] = (configModule, filename) => {
        const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
          fileName: filename,
        });
        configModule._compile(result.outputText, filename);
      };
      mod = nodeRequire(configPath);
    } finally {
      if (previous) nodeRequire.extensions['.ts'] = previous;
      else delete nodeRequire.extensions['.ts'];
    }
  } else {
    mod = nodeRequire(configPath);
  }
  return mod?.default ?? mod;
}

async function readPath(configPath, keys) {
  const config = await readProjectConfig(configPath);
  const value = keys.reduce((object, key) => object?.[key], config);
  return typeof value === 'string' ? value : null;
}

// Evaluate executable configs with isolated platform flags and a fresh module cache.
// Return only the requested path. Native signing options stay inside the worker.
function readPlatformPath(configPath, keys, env) {
  if (configPath.endsWith('.json')) return readPath(configPath, keys);
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { configPath, keys },
      env: { ...process.env, ...env },
    });
    worker.once('error', reject);
    worker.once('exit', code => reject(new Error(`Config reader exited before returning a directory (${code})`)));
    worker.once('message', ({ value, error }) => {
      if (error) reject(new Error(error));
      else resolve(value);
      worker.terminate();
    });
  });
}

if (parentPort && workerData?.configPath && workerData?.keys) {
  readPath(workerData.configPath, workerData.keys).then(
    value => parentPort.postMessage({ value }),
    error => parentPort.postMessage({ error: String(error) })
  );
}

module.exports = { findProjectConfig, readProjectConfig, readPlatformPath };

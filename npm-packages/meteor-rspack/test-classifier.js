const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { rspack } = require('@rspack/core');
const { createTestRspackConfig } = require('./config.js');

function moduleIssuer(module) {
  return module && (
    module.resource || module.userRequest ||
    (typeof module.identifier === 'function' ? module.identifier() : '')
  ) || '';
}

function isBareRequest(request) {
  return request && !request.startsWith('.') && !path.isAbsolute(request);
}

class TestDependencyGraphPlugin {
  constructor(entryFiles, output) {
    this.entryFiles = entryFiles;
    this.output = output;
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('MeteorTestDependencyGraph', compilation => {
      compilation.hooks.finishModules.tap('MeteorTestDependencyGraph', () => {
        const graph = compilation.moduleGraph;
        for (const [entryName, entryData] of compilation.entries) {
          const requests = new Map();
          const seen = new Set();
          const queue = entryData.dependencies
            .map(dependency => graph.getModule(dependency))
            .filter(Boolean);
          while (queue.length > 0) {
            const module = queue.shift();
            if (!module || seen.has(module)) continue;
            seen.add(module);
            for (const connection of graph.getOutgoingConnections(module)) {
              const request = connection.dependency && connection.dependency.request;
              if (request) {
                const issuer = moduleIssuer(module);
                const key = `${request}\0${issuer}`;
                requests.set(key, { request, issuer });
              }
              if (connection.module && !seen.has(connection.module)) {
                queue.push(connection.module);
              }
            }
          }
          this.output.push({
            file: this.entryFiles.get(entryName),
            requests: [...requests.values()],
          });
        }
      });
    });
  }
}

function runCompiler(compiler) {
  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      const finish = finalError => compiler.close(closeError => {
        if (finalError || closeError) reject(finalError || closeError);
        else resolve();
      });
      if (error) return finish(error);
      if (stats && stats.hasErrors()) {
        return finish(new Error(stats.toString({ all: false, errors: true })));
      }
      finish();
    });
  });
}

async function analyzeTestEntries({ root, entries, target = 'node' }) {
  const resolvedRoot = path.resolve(root);
  const files = [...new Set(entries.map(file => path.resolve(file)))].sort();
  if (files.length === 0) return [];
  const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-test-graph-'));
  const entryFiles = new Map(files.map((file, index) => [`test-${index}`, file]));
  const result = [];
  const config = createTestRspackConfig({
    root: resolvedRoot,
    target,
    typescript: true,
    jsx: true,
  });
  config.entry = Object.fromEntries(
    [...entryFiles].map(([name, file]) => [name, file]),
  );
  config.output = {
    path: outputPath,
    filename: '[name].js',
    clean: false,
  };
  config.externals = [({ context, request }, callback) => {
    if (/^meteor\//.test(request || '') ||
        /^@rstest\/(?:core|browser|playwright)(?:\/|$)/.test(request || '')) {
      callback(null, `commonjs ${request}`);
      return;
    }
    if (isBareRequest(request)) {
      try {
        require.resolve(request, { paths: [context || resolvedRoot] });
      } catch {
        callback(null, `commonjs ${request}`);
        return;
      }
    }
    callback();
  }];
  config.plugins = [
    ...config.plugins || [],
    new TestDependencyGraphPlugin(entryFiles, result),
  ];

  try {
    await runCompiler(rspack(config));
    return result.sort((left, right) => left.file.localeCompare(right.file));
  } finally {
    fs.rmSync(outputPath, { recursive: true, force: true });
  }
}

module.exports = { analyzeTestEntries };

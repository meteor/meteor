#!/usr/bin/env node

// Type-checks all package .d.ts files by discovering them via
// package-types.json (the same metadata zodern:types uses) with a
// fallback to index.d.ts, then generating a tsconfig with the
// appropriate meteor/* path mappings.

import { execFileSync } from 'child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, name, maxDepth, depth = 0) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (entry === name) {
      results.push(full);
    } else if ((maxDepth == null || depth < maxDepth) && lstatSync(full).isDirectory()) {
      results.push(...walk(full, name, maxDepth, depth + 1));
    }
  }
  return results;
}

const packagesDir = join(root, 'packages');

// Collect all (meteorModule, dtsPath) entries from two sources:
// 1. package-types.json files
// 2. index.d.ts files in packages that lack package-types.json (e.g. npm-mongo)
const entries = new Map();

for (const ptFile of walk(packagesDir, 'package-types.json')) {
  const config = JSON.parse(readFileSync(ptFile, 'utf-8'));
  if (!config.typesEntry) continue;

  const pkgDir = dirname(ptFile);
  const dtsPath = join(pkgDir, config.typesEntry);
  if (!existsSync(dtsPath)) continue;

  // Derive the meteor module name from the directory path.
  // packages/foo -> meteor/foo
  // packages/deprecated/underscore -> meteor/underscore
  const relFromPackages = relative(packagesDir, pkgDir);
  const pkgName = relFromPackages.split('/').pop();
  entries.set(`meteor/${pkgName}`, dtsPath);
}

for (const dtsPath of walk(packagesDir, 'index.d.ts', 2)) {
  const pkgDir = dirname(dtsPath);
  if (existsSync(join(pkgDir, 'package-types.json'))) continue;

  const pkgName = relative(packagesDir, pkgDir);
  const meteorModule = `meteor/${pkgName}`;
  if (!entries.has(meteorModule)) {
    entries.set(meteorModule, dtsPath);
  }
}

const paths = {};
const include = [];
for (const [meteorModule, dtsPath] of entries) {
  paths[meteorModule] = [dtsPath];
  include.push(dtsPath);
}

const tsconfig = {
  compilerOptions: {
    noEmit: true,
    strict: true,
    moduleResolution: 'node',
    module: 'commonjs',
    target: 'es2020',
    skipLibCheck: false,
    baseUrl: root,
    paths,
  },
  include,
};

const tmpDir = mkdtempSync(join(tmpdir(), 'meteor-types-test-'));
const tsconfigPath = join(tmpDir, 'tsconfig.json');
writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

console.log(`Checking ${include.length} declaration files...`);

try {
  execFileSync('npx', ['tsc', '--noEmit', '-p', tsconfigPath], {
    cwd: root,
    stdio: 'inherit',
  });
  console.log('All type declarations OK.');
} catch {
  process.exit(1);
}

// Build plugins are published with every package in their `use` closure
// compiled into the isopack (plugin.<name>.os/packages/*.js), so a change in
// an embedded package only reaches users once the plugin package itself is
// bumped and republished.
//
// node build-plugin-cascade.js                 # each build plugin package and what it embeds
// node build-plugin-cascade.js minifier-css    # build plugin packages that embed the given packages
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SERVER_ARCHES = ['server', 'os'];

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function packageNames(names) {
  return toArray(names)
    .map(name => String(name).split('@')[0])
    .filter(name => !name.startsWith('isobuild:'));
}

function runsOnServer(arch) {
  const arches = toArray(arch);
  return arches.length === 0 || arches.some(a =>
    SERVER_ARCHES.some(s => a === s || a.startsWith(`${s}.`)));
}

// Evaluates package.js against a stub Package API and records the package's
// build plugins plus what its server build uses or implies.
function readPackageJs(file) {
  const info = { name: null, uses: new Set(), plugins: [] };
  const record = (names, arch, options) => {
    if (arch && !Array.isArray(arch) && typeof arch === 'object') {
      options = arch;
      arch = undefined;
    }
    if ((options && options.weak) || !runsOnServer(arch)) return;
    packageNames(names).forEach(name => info.uses.add(name));
  };
  const api = new Proxy({}, {
    get: (_, method) => (method === 'use' || method === 'imply') ? record : () => {},
  });
  const Package = new Proxy({}, {
    get: (_, method) => (arg) => {
      if (method === 'describe' && arg && arg.name) info.name = arg.name;
      if (method === 'onUse') arg(api);
      if (method === 'registerBuildPlugin') {
        info.plugins.push({ name: arg.name, use: packageNames(arg.use) });
      }
    },
  });
  const stub = new Proxy({}, { get: () => () => {} });
  const sandbox = { Package, Npm: stub, Cordova: stub, process, console };
  sandbox.global = sandbox;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return info;
}

function loadPackages(packagesDir) {
  const packages = {};
  for (const dir of fs.readdirSync(packagesDir)) {
    const file = path.join(packagesDir, dir, 'package.js');
    if (!fs.existsSync(file)) continue;
    const info = readPackageJs(file);
    packages[info.name || dir] = info;
  }
  return packages;
}

// The plugins' `use` lists plus the server-side dependencies of those
// packages, transitively. Every package implicitly uses `meteor`.
function embeddedPackages(packages, name) {
  const embedded = new Set();
  const queue = packages[name].plugins.flatMap(plugin => plugin.use);
  while (queue.length) {
    const dep = queue.pop();
    if (embedded.has(dep)) continue;
    embedded.add(dep);
    if (dep !== 'meteor') queue.push('meteor');
    if (packages[dep]) queue.push(...packages[dep].uses);
  }
  return embedded;
}

// Maps each build plugin package outside `changed` to the changed packages it embeds.
function cascade(packages, changed) {
  const changedSet = new Set(changed);
  const result = {};
  for (const name of Object.keys(packages).sort()) {
    if (changedSet.has(name) || packages[name].plugins.length === 0) continue;
    const hits = [...embeddedPackages(packages, name)].filter(dep => changedSet.has(dep));
    if (hits.length) result[name] = hits.sort();
  }
  return result;
}

module.exports = { loadPackages, embeddedPackages, cascade };

if (require.main === module) {
  const packages = loadPackages(path.resolve(__dirname, '../../../packages'));
  const changed = process.argv.slice(2);
  if (changed.length === 0) {
    for (const name of Object.keys(packages).sort()) {
      if (packages[name].plugins.length === 0) continue;
      console.log(`${name}: ${[...embeddedPackages(packages, name)].sort().join(' ')}`);
    }
  } else {
    const result = cascade(packages, changed);
    for (const [name, hits] of Object.entries(result)) {
      console.log(`${name}: embeds ${hits.join(', ')}`);
    }
    if (Object.keys(result).length === 0) console.log('No build plugin embeds the given packages.');
  }
}

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');
const version = '26.12.1.104';
const buildId = '8--abcdef';
const fixtures = [];

afterEach(() => {
  for (const directory of fixtures.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function runCopy({ arm = false, ambiguous = false, incomplete = false,
  existing = false, listFailure = false, production = true, older = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-bundle-copy-'));
  fixtures.push(directory);
  const scripts = path.join(directory, 'scripts/admin');
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(path.join(directory, 'bin'));
  fs.writeFileSync(path.join(directory, 'meteor'), `BUNDLE_VERSION=${version}\n`);
  for (const name of [
    'copy-dev-bundle-from-jenkins.sh',
    'copy-dev-bundle-mac-m1-from-jenkins.sh',
    'copy-dev-bundle-common.sh',
  ]) {
    const source = path.join(repoRoot, 'scripts/admin', name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(scripts, name));
  }
  const suffix = arm ? '-mac-m1' : '';
  const oldDirectory = `dev-bundle-2026-10-22--${buildId}${suffix}`;
  const newDirectory = `dev-bundle-2026-10-23--${buildId}${suffix}`;
  const platforms = arm ? ['Darwin_arm64'] : [
    'Darwin_x86_64', 'Linux_aarch64', 'Linux_x86_64', 'Windows_x86_64',
  ];
  const tarballs = v => platforms.map(p => `dev_bundle_${p}_${v}.tar.gz`);
  const scenario = {
    directories: {
      [oldDirectory]: tarballs(ambiguous || older ? version : '24.22.1.0'),
      [newDirectory]: incomplete ? tarballs(version).slice(1)
        : tarballs(older ? '24.22.1.0' : version),
    },
    existing,
    listFailure,
  };
  fs.writeFileSync(path.join(directory, 'scenario.json'), JSON.stringify(scenario));
  const logPath = path.join(directory, 'calls.jsonl');
  fs.writeFileSync(path.join(directory, 'bin/aws'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const scenario = JSON.parse(fs.readFileSync(process.env.COPY_SCENARIO, 'utf8'));
fs.appendFileSync(process.env.COPY_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 's3' && args[1] === 'ls' && args.length === 3) {
  const uri = args[2];
  if (uri === 's3://com.meteor.jenkins/') {
    for (const name of Object.keys(scenario.directories)) console.log('PRE ' + name + '/');
  } else if (uri.startsWith('s3://com.meteor.jenkins/')) {
    if (scenario.listFailure) {
      console.error('AccessDenied: source listing failed');
      process.exit(1);
    }
    const name = uri.slice('s3://com.meteor.jenkins/'.length, -1);
    if (!scenario.directories[name]) process.exit(2);
    for (const file of scenario.directories[name]) console.log('2026-10-23 13:00:00 100 ' + file);
  } else if (uri.startsWith('s3://com.meteor.static/')) {
    process.exit(scenario.existing ? 0 : 1);
  } else process.exit(2);
} else if (args[0] === 's3' && args[1] === 'cp') {
  process.exit(0);
} else {
  console.error('Unexpected AWS arguments: ' + JSON.stringify(args));
  process.exit(2);
}
`, { mode: 0o755 });
  const script = arm ? 'copy-dev-bundle-mac-m1-from-jenkins.sh'
    : 'copy-dev-bundle-from-jenkins.sh';
  const result = spawnSync('bash', [path.join(scripts, script),
    ...(production ? ['--prod'] : []), buildId], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LC_ALL: 'C',
      PATH: `${path.join(directory, 'bin')}:${process.env.PATH}`,
      COPY_SCENARIO: path.join(directory, 'scenario.json'),
      COPY_CALLS: logPath,
    },
  });
  const calls = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').trim().split('\n').map(JSON.parse) : [];
  return { result, copies: calls.filter(args => args[1] === 'cp'), oldDirectory, newDirectory };
}

test.each([false, true])('selects this bundle version across colliding runs (ARM: %s)', arm => {
  const { result, copies, newDirectory } = runCopy({ arm });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(copies).toEqual([[
    's3', 'cp', '--acl', 'public-read', '--recursive',
    `s3://com.meteor.jenkins/${newDirectory}/`, 's3://com.meteor.static/',
  ]]);
});

test('retains the test publication destination unless --prod is given', () => {
  const { result, copies } = runCopy({ production: false });
  expect(result.status).toBe(0);
  expect(copies[0].at(-1)).toBe('s3://com.meteor.static/test/');
});

test('selects the requested version even when it is in the older directory', () => {
  const { result, copies, oldDirectory } = runCopy({ older: true });
  expect(result.status).toBe(0);
  expect(copies[0].at(-2)).toBe(`s3://com.meteor.jenkins/${oldDirectory}/`);
});

test.each([false, true])('rejects two directories containing the same version (ARM: %s)', arm => {
  const { result, copies } = runCopy({ arm, ambiguous: true });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/multiple builds/i);
  expect(copies).toEqual([]);
});

test('rejects an incomplete platform set before publishing', () => {
  const { result, copies } = runCopy({ incomplete: true });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/tarballs/i);
  expect(copies).toEqual([]);
});

test('does not overwrite a published bundle', () => {
  const { result, copies } = runCopy({ existing: true });
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toMatch(/already exists/i);
  expect(copies).toEqual([]);
});

test('stops when the source listing fails', () => {
  const { result, copies } = runCopy({ listFailure: true });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/AccessDenied/);
  expect(copies).toEqual([]);
});

import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import execa from 'execa';
import fs from 'fs-extra';
import {
  setupMeteorApp,
  buildMeteorApp,
  runBuiltApp,
  startMongo,
  getFreePort,
} from './helpers';

const describePosix = process.platform === 'win32' ? describe.skip : describe;

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function assertCommand(executable) {
  assert.ok((await fs.stat(executable)).mode & 0o100, `${executable} must be executable`);
  const { stdout } = await execa(process.execPath, [executable], { stripFinalNewline: false });
  expect(stdout).toBe('portable');
}

// Search only real directories: following directory aliases could count a package
// twice or escape the deployment. Identify packages by their manifests, not depth.
async function findPackages(directory, names, found = new Map(names.map(name => [name, []]))) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await findPackages(filename, names, found);
    } else if (entry.isFile() && entry.name === 'package.json') {
      const { name } = await fs.readJson(filename);
      if (found.has(name)) found.get(name).push(directory);
    }
  }
  return found;
}

async function assertPackagedCommands(buildOutputDir, sourceDir, diagnostics) {
  expect(await fs.pathExists(sourceDir)).toBe(false);
  const bundle = await fs.realpath(path.join(buildOutputDir, 'bundle'));
  const packages = await findPackages(path.join(bundle, 'programs/server/npm'), [
    '@example/workspace', 'portable-command',
  ]);
  for (const [name, instances] of packages) {
    assert.equal(instances.length, 1, `Expected exactly one packaged ${name}: ${instances}`);
  }
  const [workspace] = packages.get('@example/workspace');
  const [commandPackage] = packages.get('portable-command');
  const command = await fs.realpath(path.join(commandPackage, 'bin/run.js'));
  assert.ok(isWithin(bundle, command), `Command escapes bundle: ${command}`);
  for (const name of ['relative', 'absolute']) {
    const executable = path.join(workspace, 'node_modules/.bin', name);
    assert.ok((await fs.lstat(executable)).isSymbolicLink(), `${executable} must remain a link`);
    const target = await fs.readlink(executable);
    diagnostics.push(`${executable} -> ${target}`);
    assert.ok(!path.isAbsolute(target), `Packaged ${name} link must be relative: ${target}`);
    const resolved = await fs.realpath(executable);
    assert.ok(isWithin(bundle, resolved), `Packaged ${name} link escapes bundle: ${resolved}`);
    assert.equal(resolved, command, `Packaged ${name} link must resolve to the packaged command`);
    await assertCommand(executable);
  }
}

describePosix('Regressions / Workspace executable portability', () => {
  test('executes packaged workspace commands after removing the source checkout', async () => {
    // Confine helper-created source, build and Mongo directories to one owned
    // root, including cleanup if a helper throws before returning its path.
    const ownedRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'meteor-workspace-portability-')));
    const tmpDir = jest.spyOn(os, 'tmpdir').mockReturnValue(ownedRoot);
    const diagnostics = [];
    let app;
    let mongo;
    try {
      const { tempDir } = await setupMeteorApp('workspace-bin-portability', { isMonorepo: true });
      assert.equal(path.dirname(await fs.realpath(tempDir)), ownedRoot);
      const appDir = path.join(tempDir, 'app');
      const commandPackage = path.join(tempDir, 'packages/portable-command');
      const packed = await execa('npm', ['pack', '--json'], { cwd: commandPackage });
      const [{ filename }] = JSON.parse(packed.stdout);
      await execa('npm', ['install', '--save', path.join(commandPackage, filename), '../packages/workspace'], {
        cwd: appDir,
      });

      const modules = await fs.realpath(path.join(appDir, 'node_modules'));
      const workspaceLink = path.join(modules, '@example/workspace');
      assert.ok((await fs.lstat(workspaceLink)).isSymbolicLink(), 'npm must link the external workspace');
      const workspace = await fs.realpath(workspaceLink);
      assert.equal(workspace, path.join(tempDir, 'packages/workspace'));
      assert.ok(!isWithin(modules, workspace), 'Workspace must be outside app node_modules');
      assert.ok(!(await fs.lstat(path.join(modules, 'portable-command'))).isSymbolicLink(),
        'npm must install the command tarball as a real directory');
      const command = await fs.realpath(path.join(modules, 'portable-command/bin/run.js'));
      assert.ok(isWithin(modules, command), 'Command must be inside app node_modules');
      const bin = path.join(workspace, 'node_modules/.bin');
      await fs.ensureDir(bin);
      await fs.symlink(path.relative(bin, command), path.join(bin, 'relative'));
      await fs.symlink(command, path.join(bin, 'absolute'));
      for (const name of ['relative', 'absolute']) await assertCommand(path.join(bin, name));

      const { buildOutputDir, processResult } = await buildMeteorApp(tempDir, {
        isMonorepo: true,
        commandOptions: ['--directory'],
        execaOptions: { timeout: 240000 },
      });
      diagnostics.push(...processResult.outputLines);
      assert.equal(path.dirname(await fs.realpath(buildOutputDir)), ownedRoot);
      assert.ok(!isWithin(tempDir, buildOutputDir), 'Build output must be outside source');
      // No source server was started. Only the disposable copy is removed.
      assert.equal(path.dirname(await fs.realpath(tempDir)), ownedRoot);
      await fs.remove(tempDir);
      await assertPackagedCommands(buildOutputDir, tempDir, diagnostics);

      await fs.access(path.join(__dirname, '../../dev_bundle/mongodb/bin/mongod'), fs.constants.X_OK);
      mongo = await startMongo();
      assert.ok(mongo && mongo.port, 'A disposable bundled Mongo instance is required');
      const port = await getFreePort();
      app = await runBuiltApp(buildOutputDir, { port, mongoUrl: mongo.mongoUrl });
      await assertPackagedCommands(buildOutputDir, tempDir, diagnostics);

      const response = await page.goto(`http://localhost:${port}/portability`);
      expect(response.status()).toBe(200);
      expect(await response.text()).toBe('portable');
      expect(await fs.pathExists(tempDir)).toBe(false);
    } catch (error) {
      const logPath = path.join(__dirname, 'test-results', `workspace-bin-portability-${Date.now()}.log`);
      await fs.outputFile(logPath, [...diagnostics, error.stack].join('\n'));
      console.error(`Workspace portability diagnostics: ${logPath}`);
      throw error;
    } finally {
      // The preset owns the page/browser. Navigate away before stopping the app.
      // Attempt every cleanup even if another resource fails to close.
      const cleanupErrors = [];
      for (const close of [
        () => page.goto('about:blank'),
        () => app?.stop(), () => mongo?.stop(),
      ]) {
        try {
          await close();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      try {
        await fs.remove(ownedRoot);
      } finally {
        tmpDir.mockRestore();
      }
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Portability cleanup failed');
    }
  }, 600000);
});

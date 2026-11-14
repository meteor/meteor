async function seedTestAppLocalCache({
  files,
  sourceLocalDir,
  targetLocalDir,
  isolateBuildPluginState = false,
}) {
  async function seed(allowSymlink, name, preserveSymlinks = true) {
    const source = files.pathJoin(sourceLocalDir, name);
    const target = files.pathJoin(targetLocalDir, name);

    files.mkdir_p(source);
    files.mkdir_p(files.pathDirname(target));
    if (allowSymlink) {
      files.symlink(source, target, 'junction');
    } else {
      await files.cp_r(source, target, { preserveSymlinks });
    }
  }

  await seed(false, 'build');
  await seed(true, 'bundler-cache');
  await seed(!isolateBuildPluginState, 'isopacks', !isolateBuildPluginState);
  await seed(
    !isolateBuildPluginState,
    'plugin-cache',
    !isolateBuildPluginState,
  );
  await seed(true, 'shell');
}

module.exports = { seedTestAppLocalCache };

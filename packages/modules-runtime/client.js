// On the client, make package resolution prefer the "browser" field of
// package.json files to the "main" field.
makeInstallerOptions.browser = true;

makeInstallerOptions.fallback = function (id, parentId, error) {
  if (id && id.startsWith('meteor/')) {
    var packageName = id.split('/', 2)[1];
    throw new Error(
      'Cannot find package "' + packageName + '". ' +
      'Try "meteor add ' + packageName + '".'
    );
  }

  throw error;
};

meteorInstall = makeInstaller(makeInstallerOptions);

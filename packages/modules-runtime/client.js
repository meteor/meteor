// On the client, make package resolution prefer the "browser" field of
// package.json files to the "main" field.
makeInstallerOptions.browser = true;
makeInstallerOptions.mainFields =
  ["browser", "module", "jsnext:main", "main"];

install = makeInstaller(makeInstallerOptions);

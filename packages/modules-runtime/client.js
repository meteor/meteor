// On the client, make package resolution prefer the "browser" field of
// package.json files to the "main" field.
makeInstallerOptions.browser = true;

meteorInstall = makeInstaller(makeInstallerOptions);

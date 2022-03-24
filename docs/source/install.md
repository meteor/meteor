---
title: Install
---
Meteor currently supports **OS X, Windows, and Linux**. Only 64-bit is supported.
Apple M1 is natively supported from Meteor 2.5.1 onward (for older versions, you will need to run with a [rosetta terminal](https://osxdaily.com/2020/11/18/how-run-homebrew-x86-terminal-apple-silicon-mac/)).

<h2 id="prereqs">Prerequisites and useful information</h2>

- If you are on a Mac M1 (Arm64 version) you need to have Rosetta 2 installed, as Meteor uses it for running MongoDB. Check how to install it [here](https://osxdaily.com/2020/12/04/how-install-rosetta-2-apple-silicon-mac/)
- Meteor works with Node.js version >= 10 and <= 14, for Windows you need to have Node.js installed for running the npm installer (tip: you can use [nvm](https://github.com/nvm-sh/nvm) for managing node versions).
- Meteor supports Windows 7/Windows Server 2008 R2 and up.
- Disabling antivirus (Windows Defender, etc.) will improve performance.
- For compatibility, Linux binaries are built with CentOS 6.4 i386/amd64.
- iOS development requires the latest Xcode.
- **Do not install meteor npm in your project's package.json by any means, the npm library is only an installer.**

<h2 id="installation">Installation</h2>

Install the latest official Meteor release from your terminal running one of the commands below.

For Linux and OS X:

```bash
curl https://install.meteor.com/ | sh
```

For Windows (Node.js is required):

```bash
npm install -g meteor
```


<h2 id="troubleshooting">Troubleshooting</h2>

If your user doesn't have permission to install global binaries, and you need to use sudo, it's necessary to append *--unsafe-perm* to the above command:

```bash
sudo npm install -g meteor --unsafe-perm
```

We strongly discourage the usage of Node.js or Meteor with root permissions.
Only run the above command with sudo if you know what you are doing.

If you only use sudo because of a distribution default permission system, [check this link for fixing it](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

In some cases you can get this error `npm WARN checkPermissions Missing write access to /usr/local/lib/node_modules` because your Node.js installation was performed with wrong permissions. An easy way to fix this is to install Node.js using [nvm](https://github.com/nvm-sh/nvm) and forcing it to be used in your terminal. You can force it in the current session of your terminal by running `nvm use 14`.

<h2 id="path-management">PATH management</h2>

By default, the Meteor installer adds its install path (by default, `~/.meteor/`) to your PATH by updating either your `.bashrc`, `.bash_profile`, or `.zshrc` as appropriate. To disable this behavior, install Meteor by running:

```bash
npm install -g meteor --ignore-meteor-setup-exec-path
```

(or by setting the environment variable `npm_config_ignore_meteor_setup_exec_path=true`)

<h2 id="old-versions-m1">Old Versions on Apple M1</h2>

For Apple M1 computers, you can append Rosetta prefix as following, if you need to run older versions of Meteor (before 2.5.1):

```bash
arch -x86_64 npm install -g meteor
```

or select Terminal in the Applications folder, press CMD(⌘)+I and check the "Open using Rosetta" option.

<h2 id="meteor-docker">Run Meteor inside Docker</h2>

You can also use a Docker container for running Meteor inside your CI, or even in your local development toolchain.

We do provide the meteor/meteor-base ubuntu-based Docker image, that comes pre-bundled with Node.JS and Meteor, and runs it as a local user (not as root).

You can refer to our meteor/galaxy-images repository to see how to use it, and the latest version. [More about meteor-base here.](https://github.com/meteor/galaxy-images/blob/master/meteor-base/README.md)


<h2 id="windows">Note for Windows users</h2>

On Windows, the installer runs faster when [Windows Developer Mode](https://docs.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development) is enabled. The installation extracts a large number of small files, which Windows Defender can cause to be very slow.


<h2 id="nvm">Node version manager</h2>

If you use a node version manager that uses a separate global `node_modules` folder for each Node version, you will need to re-install the `meteor` npm package when changing to a Node version for the first time. Otherwise, the `meteor` command will no longer be found.

<h2 id="fish-shell">Note for fish shell users (Linux)</h2>

To be able to user `meteor` command from fish it's needed to include `/home/<user>/.meteor` in `$PATH`; to do that just add this line in `/home/<user>/.config/fish/config.fish` file (replace `<user>` with your username):

`set PATH /home/<user>/.meteor $PATH`

<h2 id="uninstall">Uninstalling Meteor</h2>

If you installed Meteor using npm, you can remove it by running:
`meteor-installer uninstall`

If you installed Meteor using curl, you can remove it by running:
`rm -rf ~/.meteor`
`sudo rm /usr/local/bin/meteor` 


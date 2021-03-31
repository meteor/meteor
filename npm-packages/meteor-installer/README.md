## Windows Meteor Installer

Requires [Node.js](https://nodejs.org/) 8 or newer.

Install Meteor on Windows by running:

```bash
npm install -g meteor
```

If Meteor is already installed, it will do nothing.

Uninstall by running:

```bash
meteor-installer uninstall
npm uninstall -g meteor
```

The installer runs faster when [Windows Developer Mode](https://docs.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development) is enabled. The installation extracts a large number of small files, which Windows Defender can cause to be very slow.

It is not recommended to run the installer and `meteor` as administrator. Otherwise, if the administrator is a separate user the `meteor` command might not always be found.

If you use a node version manager that uses a separate global `node_modules` folder for each Node version, you will need to re-install the `meteor` npm package when changing to a Node version for the first time. Otherwise, the `meteor` command will no longer be found.
